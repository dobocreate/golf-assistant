import { getProfile } from '@/actions/profile';
import { getClubs } from '@/actions/club';
import { ProfileForm } from '@/features/profile/components/profile-form';
import { ClubList } from '@/features/profile/components/club-list';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'プロファイル | Golf Assistant',
};

export default async function ProfilePage() {
  const [profile, clubs] = await Promise.all([getProfile(), getClubs()]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold mb-6">プロファイル</h1>
        <ProfileForm profile={profile} />
      </div>

      <ClubList clubs={clubs} profileExists={!!profile} />
    </div>
  );
}
