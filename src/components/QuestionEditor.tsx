import FieldError from './FieldError.tsx'
import {
  choice,
  ids,
  move,
  QUESTION_TYPE_LABELS,
  trueFalseChoices,
  type EditorErrors,
  type QuestionDraft,
  type QuestionType,
} from '../lib/editorModel.ts'
import { focusSoon } from '../lib/focus.ts'
import { actionButton, actionButtonDanger, input } from '../lib/styles.ts'

interface Props {
  question: QuestionDraft
  index: number
  total: number
  errors: EditorErrors
  disabled: boolean
  onChange: (question: QuestionDraft) => void
  onMove: (delta: -1 | 1) => void
  onDelete: () => void
}

const iconButton = `${actionButton} w-11 px-0`
const iconButtonDanger = `${actionButtonDanger} w-11 px-0`

/** aria props linking a field to its inline error, if any. */
function errorProps(id: string, errors: EditorErrors) {
  return errors[id] ? { 'aria-invalid': true, 'aria-describedby': `${id}-error` } : {}
}

export default function QuestionEditor({
  question,
  index,
  total,
  errors,
  disabled,
  onChange,
  onMove,
  onDelete,
}: Props) {
  const number = index + 1
  const textId = ids.questionText(question)
  const choicesId = ids.questionChoices(question)
  const upId = `q-${question.key}-up`
  const downId = `q-${question.key}-down`

  function setType(type: QuestionType) {
    if (type === question.type) return
    if (type === 'true_false') {
      onChange({ ...question, type, choices: trueFalseChoices(), stashedChoices: question.choices })
    } else {
      const restored = question.stashedChoices ?? [choice(), choice()]
      onChange({ ...question, type, choices: restored, stashedChoices: undefined })
    }
  }

  function updateChoice(key: string, text: string) {
    onChange({
      ...question,
      choices: question.choices.map((c) => (c.key === key ? { ...c, text } : c)),
    })
  }

  function addChoice() {
    const added = choice()
    onChange({ ...question, choices: [...question.choices, added] })
    focusSoon(ids.choice(added))
  }

  function moveChoice(i: number, delta: -1 | 1) {
    const c = question.choices[i]
    onChange({ ...question, choices: move(question.choices, i, delta) })
    // Keep focus on the same arrow; if it just became disabled (now first/last), use the other one.
    const target = i + delta
    const sameDisabled = delta === -1 ? target === 0 : target === question.choices.length - 1
    const direction = (delta === -1) !== sameDisabled ? 'up' : 'down'
    focusSoon(`c-${c.key}-${direction}`)
  }

  function deleteChoice(i: number) {
    const remaining = question.choices.filter((_, j) => j !== i)
    onChange({ ...question, choices: remaining })
    const neighbor = remaining[Math.max(0, i - 1)]
    focusSoon(neighbor ? ids.choice(neighbor) : `q-${question.key}-add-choice`)
  }

  return (
    <li>
      <fieldset
        className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
        disabled={disabled}
      >
        <legend className="float-left pt-2 text-lg font-semibold">Question {number}</legend>
        <div className="float-right flex gap-2">
          <button
            id={upId}
            type="button"
            onClick={() => onMove(-1)}
            disabled={index === 0}
            aria-label={`Move question ${number} up`}
            className={iconButton}
          >
            <span aria-hidden="true">↑</span>
          </button>
          <button
            id={downId}
            type="button"
            onClick={() => onMove(1)}
            disabled={index === total - 1}
            aria-label={`Move question ${number} down`}
            className={iconButton}
          >
            <span aria-hidden="true">↓</span>
          </button>
        </div>

        <div className="clear-both pt-4">
          <label htmlFor={textId} className="mb-1 block font-medium">
            Question text
          </label>
          <textarea
            id={textId}
            rows={2}
            value={question.text}
            onChange={(e) => onChange({ ...question, text: e.target.value })}
            className={`${input} py-2`}
            {...errorProps(textId, errors)}
          />
          <FieldError id={textId} message={errors[textId]} />
        </div>

        <div className="mt-4 sm:w-64">
          <label htmlFor={`q-${question.key}-type`} className="mb-1 block font-medium">
            Type
          </label>
          <select
            id={`q-${question.key}-type`}
            value={question.type}
            onChange={(e) => setType(e.target.value as QuestionType)}
            className={input}
          >
            {(Object.keys(QUESTION_TYPE_LABELS) as QuestionType[]).map((t) => (
              <option key={t} value={t}>
                {QUESTION_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-5">
          <h3 id={choicesId} tabIndex={-1} className="font-medium">
            Choices
          </h3>
          <FieldError id={choicesId} message={errors[choicesId]} />

          {question.type === 'true_false' ? (
            <>
              <ul className="mt-2 space-y-2">
                {question.choices.map((c) => (
                  <li key={c.key} className="rounded-lg bg-slate-100 px-3 py-2 text-slate-800">
                    {c.text}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-sm text-slate-600">
                True / False questions always use these two choices.
              </p>
            </>
          ) : (
            <>
              <ol className="mt-2 space-y-3">
                {question.choices.map((c, i) => {
                  const choiceId = ids.choice(c)
                  return (
                    <li key={c.key}>
                      <label htmlFor={choiceId} className="sr-only">
                        Question {number}, choice {i + 1}
                      </label>
                      <div className="flex gap-2">
                        <input
                          id={choiceId}
                          type="text"
                          value={c.text}
                          placeholder={`Choice ${i + 1}`}
                          onChange={(e) => updateChoice(c.key, e.target.value)}
                          className={input}
                          {...errorProps(choiceId, errors)}
                        />
                        <button
                          id={`c-${c.key}-up`}
                          type="button"
                          onClick={() => moveChoice(i, -1)}
                          disabled={i === 0}
                          aria-label={`Move choice ${i + 1} up`}
                          className={`${iconButton} shrink-0`}
                        >
                          <span aria-hidden="true">↑</span>
                        </button>
                        <button
                          id={`c-${c.key}-down`}
                          type="button"
                          onClick={() => moveChoice(i, 1)}
                          disabled={i === question.choices.length - 1}
                          aria-label={`Move choice ${i + 1} down`}
                          className={`${iconButton} shrink-0`}
                        >
                          <span aria-hidden="true">↓</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteChoice(i)}
                          aria-label={`Delete choice ${i + 1}`}
                          className={`${iconButtonDanger} shrink-0`}
                        >
                          <span aria-hidden="true">✕</span>
                        </button>
                      </div>
                      <FieldError id={choiceId} message={errors[choiceId]} />
                    </li>
                  )
                })}
              </ol>
              <button
                id={`q-${question.key}-add-choice`}
                type="button"
                onClick={addChoice}
                className={`${actionButton} mt-3`}
              >
                + Add Choice
              </button>
            </>
          )}
        </div>

        <div className="mt-6 border-t border-slate-200 pt-4">
          <button type="button" onClick={onDelete} className={actionButtonDanger}>
            Delete Question
          </button>
        </div>
      </fieldset>
    </li>
  )
}
