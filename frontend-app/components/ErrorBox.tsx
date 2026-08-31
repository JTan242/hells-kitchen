import Link from 'next/link';

/**
 * One place to render a failure. The API layer already turns transport errors
 * into a human sentence ("is the backend running?"), so this just presents it
 * and always offers a way out of the dead end.
 */
export function ErrorBox({
  title,
  message,
  backHref = '/recipes',
}: {
  title: string;
  message: string;
  backHref?: string;
}) {
  return (
    <div className="error-box">
      <h2>{title}</h2>
      <p>{message}</p>
      <p className="note">
        <Link href={backHref}>← Back to all recipes</Link>
      </p>
    </div>
  );
}
