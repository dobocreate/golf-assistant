import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '認証 | Golf Assistant',
};

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
