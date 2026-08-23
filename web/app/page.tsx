import Link from "next/link";

/**
 * A placeholder, on purpose. The front page is START-HERE.md step 4 and it is
 * not this. What is here is enough to prove the app stands up and that the
 * style system reaches it.
 */
export default function Home() {
  return (
    <main className="page prose">
      <h1>tinymachines</h1>
      <p>
        A transistor-level MOS 6502, and the things built on it. The
        documentation tree is at <Link href="/docs">/docs</Link>, and the
        style guide and its widget zoo are at <Link href="/style">/style</Link>.
      </p>
    </main>
  );
}
