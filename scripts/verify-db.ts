/**
 * Phase 2 verification: checks RLS and the submission RPC against the live Supabase project.
 *
 * Usage: npm run verify:db
 * Needs in .env.local: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, INSTRUCTOR_EMAIL, INSTRUCTOR_PASSWORD
 *
 * Creates a temporary survey, exercises it as anon and as the instructor, then deletes it.
 * Refuses to run if another survey is already Active, so real data is never touched.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = process.env.VITE_SUPABASE_URL
const key = process.env.VITE_SUPABASE_ANON_KEY
const email = process.env.INSTRUCTOR_EMAIL
const password = process.env.INSTRUCTOR_PASSWORD

if (!url || !key || !email || !password) {
  console.error(
    'Missing env. Set VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, INSTRUCTOR_EMAIL and INSTRUCTOR_PASSWORD in .env.local.',
  )
  process.exit(1)
}

const opts = { auth: { persistSession: false, autoRefreshToken: false } }
const anon = createClient(url, key, opts)
const instructor = createClient(url, key, opts)

let failures = 0
function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && detail ? `  (${detail})` : ''}`)
  if (!ok) failures++
}

function must<T>(
  res: { data: T; error: { message: string } | null },
  what: string,
): NonNullable<T> {
  if (res.error) throw new Error(`${what}: ${res.error.message}`)
  if (res.data == null) throw new Error(`${what}: no data returned`)
  return res.data
}

async function submit(client: SupabaseClient, surveyId: string, token: string, answers: object[]) {
  return client.rpc('submit_survey_response', {
    p_survey_id: surveyId,
    p_anonymous_token: token,
    p_answers: answers,
  })
}

let surveyId: string | undefined
const extraIds: string[] = []

async function main() {
  // --- Instructor login --------------------------------------------------
  const login = await instructor.auth.signInWithPassword({ email: email!, password: password! })
  check('instructor can sign in', !login.error, login.error?.message)
  if (login.error) return

  const active = must(
    await instructor.from('surveys').select('id,title').eq('status', 'active'),
    'check active',
  )
  if (active.length > 0) {
    console.error(`Aborting: survey "${active[0].title}" is already Active. Close it first.`)
    failures++
    return
  }

  // --- Instructor full access: create survey, questions, choices ----------
  const survey = must(
    await instructor
      .from('surveys')
      .insert({ title: '[verify-db] temporary survey' })
      .select()
      .single(),
    'create survey',
  )
  surveyId = survey.id
  check('instructor can create survey (defaults to draft)', survey.status === 'draft')

  const [mc, tf] = must(
    await instructor
      .from('questions')
      .insert([
        {
          survey_id: survey.id,
          question_text: 'MC?',
          question_type: 'multiple_choice',
          position: 1,
        },
        { survey_id: survey.id, question_text: 'TF?', question_type: 'true_false', position: 2 },
      ])
      .select()
      .order('position'),
    'create questions',
  )
  const choices = must(
    await instructor
      .from('choices')
      .insert([
        { question_id: mc.id, choice_text: 'A', position: 1 },
        { question_id: mc.id, choice_text: 'B', position: 2 },
        { question_id: tf.id, choice_text: 'True', position: 1 },
        { question_id: tf.id, choice_text: 'False', position: 2 },
      ])
      .select()
      .order('position'),
    'create choices',
  )
  const mcA = choices.find((c) => c.question_id === mc.id)!
  const tfTrue = choices.find((c) => c.question_id === tf.id)!
  check('instructor can create questions and choices', choices.length === 4)

  const bad = await instructor.from('surveys').update({ status: 'bogus' }).eq('id', survey.id)
  check('status check constraint rejects invalid status', !!bad.error)

  // --- Anon cannot see drafts --------------------------------------------
  const draftView = await anon.from('surveys').select('id').eq('id', survey.id)
  check('anon cannot read draft survey', (draftView.data ?? []).length === 0)
  const draftQ = await anon.from('questions').select('id').eq('survey_id', survey.id)
  check('anon cannot read draft questions', (draftQ.data ?? []).length === 0)
  const draftSubmit = await submit(anon, survey.id, 'tok-draft', [])
  check('anon cannot submit to draft', draftSubmit.error?.message === 'SURVEY_NOT_ACTIVE')

  // --- Activate (RPC) ----------------------------------------------------
  const anonActivate = await anon.rpc('activate_survey', { p_survey_id: survey.id })
  check('anon cannot call activate_survey', !!anonActivate.error)

  const before = survey.updated_at
  const activated = must(
    await instructor.rpc('activate_survey', { p_survey_id: survey.id }),
    'activate',
  ) as { status: string; public_slug: string; updated_at: string }
  const slug = activated.public_slug
  check('activate_survey sets status to active', activated.status === 'active')
  check(
    'activate_survey generates a 6-character public slug',
    /^[a-hjkmnp-z2-9]{6}$/.test(slug ?? ''),
    String(slug),
  )
  check('updated_at trigger bumps timestamp', activated.updated_at !== before)

  const second = await instructor
    .from('surveys')
    .insert({ title: '[verify-db] second active', status: 'active' })
    .select()
  check('only one survey can be active', !!second.error)
  if (second.data?.[0]) await instructor.from('surveys').delete().eq('id', second.data[0].id)

  // --- Anon reads active survey ------------------------------------------
  const pub = await anon.from('surveys').select('id,title').eq('public_slug', slug).single()
  check('anon can read active survey by slug', pub.data?.id === survey.id, pub.error?.message)
  const pubQ = await anon.from('questions').select('id').eq('survey_id', survey.id)
  check('anon can read active survey questions', pubQ.data?.length === 2)
  const pubC = await anon.from('choices').select('id').in('question_id', [mc.id, tf.id])
  check('anon can read active survey choices', pubC.data?.length === 4)

  // --- get_public_survey (RPC) -------------------------------------------
  const pubActive = must(
    await anon.rpc('get_public_survey', { p_slug: slug }),
    'public survey',
  ) as {
    status: string
    survey: { id: string; title: string }
    questions: { question_text: string; choices: { choice_text: string }[] }[]
  }
  check(
    'get_public_survey returns active survey with ordered questions and choices',
    pubActive.status === 'active' &&
      pubActive.survey.id === survey.id &&
      pubActive.questions.map((q) => q.question_text).join() === 'MC?,TF?' &&
      pubActive.questions[0].choices.map((c) => c.choice_text).join() === 'A,B',
    JSON.stringify(pubActive).slice(0, 200),
  )
  check(
    'get_public_survey exposes no response data',
    !/response|anonymous_token|count/i.test(JSON.stringify(pubActive)),
  )
  const pubMissing = must(
    await anon.rpc('get_public_survey', { p_slug: 'no-such-slug' }),
    'public missing',
  ) as { status: string }
  check('get_public_survey reports not_found for unknown slug', pubMissing.status === 'not_found')

  // --- Anon submits via RPC ----------------------------------------------
  const good = [
    { question_id: mc.id, choice_id: mcA.id },
    { question_id: tf.id, choice_id: tfTrue.id },
  ]
  const ok = await submit(anon, survey.id, 'tok-1', good)
  check('anon can submit a response', ok.data?.success === true, ok.error?.message)

  const dup = await submit(anon, survey.id, 'tok-1', good)
  check('duplicate token rejected', dup.error?.message === 'DUPLICATE_RESPONSE', dup.error?.message)

  const missing = await submit(anon, survey.id, 'tok-2', [good[0]])
  check(
    'missing answer rejected',
    missing.error?.message === 'MISSING_REQUIRED_ANSWER',
    missing.error?.message,
  )

  const wrongChoice = await submit(anon, survey.id, 'tok-3', [
    { question_id: mc.id, choice_id: tfTrue.id },
    good[1],
  ])
  check(
    'choice from another question rejected',
    wrongChoice.error?.message === 'INVALID_CHOICE',
    wrongChoice.error?.message,
  )

  const wrongQ = await submit(anon, survey.id, 'tok-4', [
    ...good,
    { question_id: crypto.randomUUID(), choice_id: mcA.id },
  ])
  check(
    'question from another survey rejected',
    wrongQ.error?.message === 'INVALID_QUESTION',
    wrongQ.error?.message,
  )

  const garbage = await submit(anon, survey.id, 'tok-5', [{ question_id: 'nope', choice_id: 'x' }])
  check(
    'malformed payload rejected',
    garbage.error?.message === 'INVALID_PAYLOAD',
    garbage.error?.message,
  )

  // --- Anon cannot read or write results directly ------------------------
  const anonResp = await anon.from('responses').select('id').eq('survey_id', survey.id)
  check('anon cannot read responses', !!anonResp.error || (anonResp.data ?? []).length === 0)
  const anonAns = await anon.from('answers').select('id').eq('question_id', mc.id)
  check('anon cannot read answers', !!anonAns.error || (anonAns.data ?? []).length === 0)
  const anonInsert = await anon
    .from('responses')
    .insert({ survey_id: survey.id, anonymous_token: 'x' })
  check('anon cannot insert responses directly', !!anonInsert.error)
  const anonUpdate = await anon
    .from('surveys')
    .update({ title: 'hacked' })
    .eq('id', survey.id)
    .select()
  check('anon cannot modify surveys', !!anonUpdate.error || (anonUpdate.data ?? []).length === 0)
  const anonDelete = await anon.from('surveys').delete().eq('id', survey.id).select()
  check('anon cannot delete surveys', !!anonDelete.error || (anonDelete.data ?? []).length === 0)

  // --- Instructor reads results ------------------------------------------
  const resp = await instructor
    .from('responses')
    .select('id,answers(choice_id)')
    .eq('survey_id', survey.id)
  check(
    'instructor can read responses and answers',
    resp.data?.length === 1 && resp.data[0].answers.length === 2,
    resp.error?.message,
  )

  // --- get_survey_results (RPC) ------------------------------------------
  // Add a second response so percentages are non-trivial: MC → B, TF → True.
  const mcB = choices.find((c) => c.question_id === mc.id && c.choice_text === 'B')!
  must(
    await submit(anon, survey.id, 'tok-results', [
      { question_id: mc.id, choice_id: mcB.id },
      { question_id: tf.id, choice_id: tfTrue.id },
    ]),
    'second response',
  )
  const anonResults = await anon.rpc('get_survey_results', { p_survey_id: survey.id })
  check('anon cannot call get_survey_results', !!anonResults.error)
  const results = must(
    await instructor.rpc('get_survey_results', { p_survey_id: survey.id }),
    'results',
  ) as {
    response_count: number
    last_response_at: string | null
    questions: {
      question_text: string
      response_count: number
      choices: { choice_text: string; count: number; percentage: number }[]
    }[]
  }
  const fmt = (q: (typeof results.questions)[number]) =>
    q.choices.map((c) => `${c.choice_text}=${c.count}/${c.percentage}`).join(',')
  check(
    'results: total response count and last response time',
    results.response_count === 2 && results.last_response_at !== null,
  )
  check(
    'results: questions in order with per-question answer counts',
    results.questions.map((q) => `${q.question_text}:${q.response_count}`).join() === 'MC?:2,TF?:2',
  )
  check(
    'results: choice counts and percentages (incl. zero-count choices)',
    fmt(results.questions[0]) === 'A=1/50,B=1/50' &&
      fmt(results.questions[1]) === 'True=2/100,False=0/0',
    `${fmt(results.questions[0])} | ${fmt(results.questions[1])}`,
  )
  const noResults = await instructor.rpc('get_survey_results', {
    p_survey_id: crypto.randomUUID(),
  })
  check('results: unknown survey returns null', !noResults.error && noResults.data === null)

  // --- Close (RPC) -------------------------------------------------------
  const anonClose = await anon.rpc('close_survey', { p_survey_id: survey.id })
  check('anon cannot call close_survey', !!anonClose.error)
  const closed = must(
    await instructor.rpc('close_survey', { p_survey_id: survey.id }),
    'close',
  ) as { status: string }
  check('close_survey sets status to closed', closed.status === 'closed')
  const closedView = await anon.from('surveys').select('id').eq('public_slug', slug)
  check('anon cannot read closed survey', (closedView.data ?? []).length === 0)
  const pubClosed = must(
    await anon.rpc('get_public_survey', { p_slug: slug }),
    'public closed',
  ) as Record<string, unknown>
  check(
    'get_public_survey reports closed without revealing content',
    pubClosed.status === 'closed' && Object.keys(pubClosed).length === 1,
    JSON.stringify(pubClosed),
  )
  const closedSubmit = await submit(anon, survey.id, 'tok-6', good)
  check('submission to closed survey rejected', closedSubmit.error?.message === 'SURVEY_NOT_ACTIVE')

  // --- History is preserved (DB triggers) --------------------------------
  const locked = (r: { error: { message: string } | null }, code: string) =>
    r.error?.message === code
  const qEdit = await instructor
    .from('questions')
    .update({ question_text: 'changed' })
    .eq('id', mc.id)
  check(
    'closed survey: question text cannot be edited',
    locked(qEdit, 'SURVEY_LOCKED'),
    qEdit.error?.message,
  )
  const qAdd = await instructor.from('questions').insert({
    survey_id: survey.id,
    question_text: 'new',
    question_type: 'true_false',
    position: 9,
  })
  check(
    'closed survey: questions cannot be added',
    locked(qAdd, 'SURVEY_LOCKED'),
    qAdd.error?.message,
  )
  const cDel = await instructor.from('choices').delete().eq('id', mcA.id)
  check(
    'closed survey: choices cannot be deleted',
    locked(cDel, 'SURVEY_LOCKED'),
    cDel.error?.message,
  )
  const qDel = await instructor.from('questions').delete().eq('id', tf.id)
  check(
    'closed survey: questions cannot be deleted',
    locked(qDel, 'SURVEY_LOCKED'),
    qDel.error?.message,
  )

  const respRows = must(
    await instructor.from('responses').select('id').eq('survey_id', survey.id),
    'responses',
  )
  const rEdit = await instructor
    .from('responses')
    .update({ anonymous_token: 'x' })
    .eq('id', respRows[0].id)
  check('responses cannot be edited', locked(rEdit, 'RESPONSES_READ_ONLY'), rEdit.error?.message)
  const rDel = await instructor.from('responses').delete().eq('id', respRows[0].id)
  check(
    'a single response cannot be deleted',
    locked(rDel, 'RESPONSES_READ_ONLY'),
    rDel.error?.message,
  )
  const aEdit = await instructor
    .from('answers')
    .update({ choice_id: mcB.id })
    .eq('response_id', respRows[0].id)
    .eq('question_id', mc.id)
  check('answers cannot be edited', locked(aEdit, 'RESPONSES_READ_ONLY'), aEdit.error?.message)
  const aDel = await instructor.from('answers').delete().eq('response_id', respRows[0].id)
  check('answers cannot be deleted', locked(aDel, 'RESPONSES_READ_ONLY'), aDel.error?.message)
  const still = must(
    await instructor.rpc('get_survey_results', { p_survey_id: survey.id }),
    'results after tampering',
  ) as { response_count: number; questions: { question_text: string }[] }
  check(
    'results unchanged after blocked tampering',
    still.response_count === 2 && still.questions.map((q) => q.question_text).join() === 'MC?,TF?',
  )

  const reactivate = await instructor.rpc('activate_survey', { p_survey_id: survey.id })
  check(
    'closed survey cannot be re-activated',
    reactivate.error?.message === 'SURVEY_NOT_DRAFT',
    reactivate.error?.message,
  )

  // --- Duplicate (RPC) ---------------------------------------------------
  const anonDup = await anon.rpc('duplicate_survey', { p_survey_id: survey.id })
  check('anon cannot call duplicate_survey', !!anonDup.error)
  const copyId = must(
    await instructor.rpc('duplicate_survey', { p_survey_id: survey.id }),
    'duplicate',
  ) as string
  extraIds.push(copyId)
  const copy = must(
    await instructor
      .from('surveys')
      .select('title,status,public_slug,questions(id,choices(id)),responses(count)')
      .eq('id', copyId)
      .single(),
    'load copy',
  )
  check('duplicate is named "Copy of ..."', copy.title === 'Copy of [verify-db] temporary survey')
  check('duplicate is a draft with no slug', copy.status === 'draft' && copy.public_slug === null)
  check(
    'duplicate copies questions and choices',
    copy.questions.length === 2 &&
      copy.questions.reduce((n: number, q: { choices: unknown[] }) => n + q.choices.length, 0) ===
        4,
  )
  check('duplicate does not copy responses', copy.responses[0]?.count === 0)

  // --- Activation rules --------------------------------------------------
  const empty = must(
    await instructor.from('surveys').insert({ title: '[verify-db] empty' }).select().single(),
    'create empty',
  )
  extraIds.push(empty.id)
  const emptyAct = await instructor.rpc('activate_survey', { p_survey_id: empty.id })
  check(
    'survey without questions cannot be activated',
    emptyAct.error?.message === 'SURVEY_HAS_NO_QUESTIONS',
    emptyAct.error?.message,
  )
  const lonely = must(
    await instructor
      .from('questions')
      .insert({
        survey_id: empty.id,
        question_text: 'Q',
        question_type: 'multiple_choice',
        position: 1,
      })
      .select()
      .single(),
    'add question',
  )
  must(
    await instructor
      .from('choices')
      .insert({ question_id: lonely.id, choice_text: 'Only', position: 1 })
      .select(),
    'add choice',
  )
  const oneChoice = await instructor.rpc('activate_survey', { p_survey_id: empty.id })
  check(
    'question with fewer than 2 choices blocks activation',
    oneChoice.error?.message === 'QUESTION_NEEDS_CHOICES',
    oneChoice.error?.message,
  )

  must(await instructor.rpc('activate_survey', { p_survey_id: copyId }), 'activate copy')
  const copy2Id = must(
    await instructor.rpc('duplicate_survey', { p_survey_id: copyId }),
    'duplicate copy',
  ) as string
  extraIds.push(copy2Id)
  must(await instructor.rpc('activate_survey', { p_survey_id: copy2Id }), 'activate copy 2')
  const statuses = must(
    await instructor.from('surveys').select('id,status').in('id', [copyId, copy2Id]),
    'statuses',
  )
  const statusOf = (id: string) => statuses.find((r) => r.id === id)?.status
  check(
    'activating a survey closes the previously active one',
    statusOf(copyId) === 'closed' && statusOf(copy2Id) === 'active',
    JSON.stringify(statuses),
  )
  must(await instructor.rpc('close_survey', { p_survey_id: copy2Id }), 'close copy 2')

  // --- save_survey (RPC) -------------------------------------------------
  const payload = [
    {
      question_text: ' First? ',
      question_type: 'multiple_choice',
      choices: [{ choice_text: 'A' }, { choice_text: 'B' }, { choice_text: 'C' }],
    },
    {
      question_text: 'Second?',
      question_type: 'true_false',
      choices: [{ choice_text: 'True' }, { choice_text: 'False' }],
    },
  ]
  const anonSave = await anon.rpc('save_survey', {
    p_survey_id: null,
    p_title: 'x',
    p_description: '',
    p_questions: payload,
  })
  check('anon cannot call save_survey', !!anonSave.error)

  const savedId = must(
    await instructor.rpc('save_survey', {
      p_survey_id: null,
      p_title: '  [verify-db] saved  ',
      p_description: '   ',
      p_questions: payload,
    }),
    'save new',
  ) as string
  extraIds.push(savedId)
  type Loaded = {
    title: string
    description: string | null
    status: string
    questions: {
      question_text: string
      question_type: string
      position: number
      choices: { choice_text: string; position: number }[]
    }[]
  }
  const loadSaved = async () =>
    must(
      await instructor
        .from('surveys')
        .select(
          'title,description,status,questions(question_text,question_type,position,choices(choice_text,position))',
        )
        .eq('id', savedId)
        .order('position', { referencedTable: 'questions' })
        .order('position', { referencedTable: 'questions.choices' })
        .single(),
      'load saved',
    ) as Loaded
  let saved = await loadSaved()
  check(
    'save_survey creates a trimmed draft (blank description → null)',
    saved.title === '[verify-db] saved' && saved.description === null && saved.status === 'draft',
  )
  check(
    'save_survey stores questions and choices in order',
    saved.questions.map((q) => `${q.position}:${q.question_text}`).join() ===
      '1:First?,2:Second?' &&
      saved.questions[0].choices.map((c) => `${c.position}${c.choice_text}`).join() === '1A,2B,3C',
  )

  must(
    await instructor.rpc('save_survey', {
      p_survey_id: savedId,
      p_title: '[verify-db] saved v2',
      p_description: 'desc',
      p_questions: [
        payload[1],
        { ...payload[0], choices: [{ choice_text: 'C' }, { choice_text: 'A' }] },
      ],
    }),
    'save update',
  )
  saved = await loadSaved()
  check(
    'save_survey update replaces and reorders questions/choices',
    saved.title === '[verify-db] saved v2' &&
      saved.description === 'desc' &&
      saved.questions.map((q) => q.question_text).join() === 'Second?,First?' &&
      saved.questions[1].choices.map((c) => c.choice_text).join() === 'C,A',
  )

  const blankChoice = await instructor.rpc('save_survey', {
    p_survey_id: savedId,
    p_title: 'should not apply',
    p_description: '',
    p_questions: [
      { question_text: 'Q', question_type: 'multiple_choice', choices: [{ choice_text: ' ' }] },
    ],
  })
  saved = await loadSaved()
  check(
    'failed save rolls back completely',
    blankChoice.error?.message === 'CHOICE_TEXT_REQUIRED' &&
      saved.title === '[verify-db] saved v2' &&
      saved.questions.length === 2,
    blankChoice.error?.message,
  )
  const noTitle = await instructor.rpc('save_survey', {
    p_survey_id: savedId,
    p_title: '  ',
    p_description: '',
    p_questions: [],
  })
  check(
    'save_survey requires a title',
    noTitle.error?.message === 'TITLE_REQUIRED',
    noTitle.error?.message,
  )

  const lockedSave = await instructor.rpc('save_survey', {
    p_survey_id: copyId,
    p_title: 'edit closed',
    p_description: '',
    p_questions: payload,
  })
  check(
    'save_survey refuses non-draft surveys',
    lockedSave.error?.message === 'SURVEY_NOT_EDITABLE',
    lockedSave.error?.message,
  )

  // --- Archive -----------------------------------------------------------
  const archived = must(
    await instructor
      .from('surveys')
      .update({ status: 'archived' })
      .eq('id', copyId)
      .select()
      .single(),
    'archive',
  )
  check('instructor can archive a closed survey', archived.status === 'archived')
}

try {
  await main()
} catch (e) {
  failures++
  console.error('ERROR', e instanceof Error ? e.message : e)
} finally {
  if (extraIds.length) {
    await instructor.from('surveys').delete().in('id', extraIds)
  }
  if (surveyId) {
    const del = await instructor.from('surveys').delete().eq('id', surveyId)
    const leftovers = await instructor.from('responses').select('id').eq('survey_id', surveyId)
    check(
      'deleting a whole survey still cascades through locked questions and responses',
      !del.error && (leftovers.data ?? []).length === 0,
      del.error?.message,
    )
  }
  await instructor.auth.signOut()
  console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed')
  process.exit(failures ? 1 : 0)
}
