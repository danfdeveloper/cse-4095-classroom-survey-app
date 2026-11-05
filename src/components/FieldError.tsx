/** Inline validation message placed directly under the field it describes. */
export default function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null
  return (
    <p id={`${id}-error`} className="mt-1 text-sm font-medium text-red-700">
      {message}
    </p>
  )
}
