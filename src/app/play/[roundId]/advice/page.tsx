import { redirect } from 'next/navigation';

export default async function AdvicePage({
  params,
}: {
  params: Promise<{ roundId: string }>;
}) {
  const { roundId } = await params;
  redirect(`/play/${roundId}/score`);
}
