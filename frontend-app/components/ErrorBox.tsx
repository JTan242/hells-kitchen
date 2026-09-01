import Link from 'next/link';

/** Renders a failure with a way out. Messages are composed in lib/api.ts. */
export function ErrorBox({ title, message }: { title: string; message: string }) {
  return (
    <div className="error-box">
      <h2>{title}</h2>
      <p>{message}</p>
      <p className="note">
        <Link href="/recipes">← Back to all recipes</Link>
      </p>
    </div>
  );
}
