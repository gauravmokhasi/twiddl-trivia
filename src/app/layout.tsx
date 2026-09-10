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
            <header className="py-8">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-sm font-semibold text-sky-600">Your daily mental workout</p>
                  <h1 className="text-3xl font-bold tracking-tight">Twiddl Trivia</h1>
                  <p className="mt-2 text-slate-600 max-w-2xl">Ask one question per day, follow other users, and answer fresh trivia whenever you want</p>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <nav className="flex flex-wrap gap-2">
                    <Link className="button button-secondary" href="/">Feed</Link>
                    <a className="button button-secondary" href="/universe">Universe</a>
                    <MyProfileLink />
                  </nav>
                  <AuthStatus />
                </div>
              </div>
            </header>
            <main>{children}</main>
          </div>
        </SupabaseProvider>
      </body>
    </html>
  );
}
