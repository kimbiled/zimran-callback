import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl px-5 py-24 text-center">
      <h1 className="display text-4xl">Nothing here</h1>
      <p className="mt-3 text-mute">This page or call doesn't exist.</p>
      <Link href="/" className="btn btn-primary mt-6">
        Back to Callback
      </Link>
    </div>
  );
}
