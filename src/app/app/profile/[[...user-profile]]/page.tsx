import { UserProfile } from "@clerk/nextjs";

export const metadata = { title: "Hồ sơ", robots: { index: false, follow: false } };

export default function ProfilePage() {
  return (
    <div>
      <p className="text-sm text-muted-foreground">
        Quản lý thông tin cá nhân và bảo mật tài khoản
      </p>
      <h1 className="display-type mt-1 text-4xl">Hồ sơ.</h1>
      <div className="mt-8 overflow-x-auto [&_[data-localization-key*='apiKeys']]:!hidden [&_[href*='api-keys']]:!hidden">
        <UserProfile routing="path" path="/app/profile" />
      </div>
    </div>
  );
}
