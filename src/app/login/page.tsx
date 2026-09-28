import AuthCard from '@/components/AuthCard';

type Props = {
  searchParams: Promise<{
    error?: string;
  }>;
};

export default async function LoginPage({ searchParams }: Props) {
  // searchParams is a Promise in this version of Next, so it has to be awaited before use.
  const { error } = await searchParams;
  const authError = error === 'auth';

  return (
    <div className="mx-auto max-w-lg pt-6">
      {authError ? (
        <div className="mb-4 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">
          That sign-in link could not be completed. Please request a new link and try again.
        </div>
      ) : null}
      <AuthCard />
    </div>
  );
}