import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';
import SupabaseProvider from '@/components/SupabaseProvider';
import AuthStatus from '@/components/AuthStatus';
import ProfileSync from '@/components/ProfileSync';
import MyProfileLink from '@/components/MyProfileLink';

export const metadata: Metadata = {
  title: 'Twiddl Trivia',
  description: 'Social quiz app prototype for questions, followers, and discoverable profiles.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <SupabaseProvider>
          <ProfileSync />
          <div className="container">
            <header className="sticky top-0 z-20 -mx-4 border-b border-white/[0.06] bg-[#09090b]/85 px-4 backdrop-blur-xl md:-mx-6 md:px-6">
              <div className="flex min-h-[4.25rem] flex-col justify-center gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center justify-between gap-6">
                  <Link href="/" className="group flex items-center gap-3">
                    <span className="grid h-9 w-9 place-items-center rounded-xl bg-violet-500 text-sm font-black text-white shadow-lg shadow-violet-500/20">T</span>
                    <span>
                      <span className="block text-sm font-bold tracking-tight text-zinc-100">Twiddl Trivia</span>
                      <span className="block text-[11px] font-medium text-zinc-500">Your daily mental workout</span>
                    </span>
                  </Link>
                  <AuthStatus />
                </div>
                <nav className="flex items-center gap-1 rounded-xl bg-white/[0.03] p-1 text-sm font-semibold text-zinc-500">
                  <Link className="rounded-lg px-3 py-2 transition hover:bg-white/[0.06] hover:text-zinc-100" href="/">Feed</Link>
                  <Link className="rounded-lg px-3 py-2 transition hover:bg-white/[0.06] hover:text-zinc-100" href="/universe">Universe</Link>
                  <MyProfileLink />
                </nav>
              </div>
            </header>
            <main>{children}</main>
          </div>
        </SupabaseProvider>
      </body>
    </html>
  );
}
