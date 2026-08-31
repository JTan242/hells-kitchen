'use client';

/**
 * Catches anything the pages did not handle themselves, so an unexpected throw
 * shows a recoverable screen instead of a blank page.
 */
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
