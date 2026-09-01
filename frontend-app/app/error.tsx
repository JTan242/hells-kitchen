'use client';

/** Catches throws the pages did not handle, so they show a recoverable screen. */
export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="error-box">
      <h2>Something went wrong</h2>
      <p>{error.message}</p>
      <p className="note">
        <button type="button" className="link-button" onClick={reset}>
          Try again
        </button>
      </p>
    </div>
  );
}
