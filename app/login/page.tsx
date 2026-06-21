import { signIn } from "@/lib/auth";

export default function LoginPage({
  searchParams,
}: {
  searchParams: { callbackUrl?: string };
}) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-neutral-950 text-neutral-100">
      <div className="w-full max-w-sm rounded-2xl border border-neutral-800 bg-neutral-900 p-8 text-center">
        <h1 className="mb-2 text-2xl font-bold tracking-tight">Nation Wheel</h1>
        <p className="mb-8 text-sm text-neutral-400">
          Sign in with Discord to access your nation.
        </p>
        <form
          action={async () => {
            "use server";
            await signIn("discord", {
              redirectTo: searchParams.callbackUrl || "/dashboard",
            });
          }}
        >
          <button
            type="submit"
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#5865F2] px-4 py-3 font-semibold text-white transition hover:bg-[#4752c4]"
          >
            Continue with Discord
          </button>
        </form>
      </div>
    </main>
  );
}
