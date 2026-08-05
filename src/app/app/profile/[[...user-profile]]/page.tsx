import { UserProfile } from "@clerk/nextjs";

export const metadata = { title: "Hồ sơ", robots: { index: false, follow: false } };

export default function ProfilePage() {
  return (
    <div>
      <p className="text-sm text-muted-foreground">Danh tính và thiết bị</p>
      <h1 className="display-type mt-1 text-4xl">Hồ sơ.</h1>
      <div className="mt-8 overflow-x-auto [&_[data-localization-key*='apiKeys']]:!hidden [&_[href*='api-keys']]:!hidden [&_.cl-navbarButton__apiKeys]:!hidden [&_.cl-profilePage__apiKeys]:!hidden [&_.cl-navbarButton__api_keys]:!hidden [&_.cl-profilePage__api_keys]:!hidden">
        <UserProfile
          routing="path"
          path="/app/profile"
          appearance={{
            elements: {
              navbarButton__apiKeys: "!hidden",
              profilePage__apiKeys: "!hidden",
              navbarButton__api_keys: "!hidden",
              profilePage__api_keys: "!hidden"
            }
          }}
        />
      </div>
    </div>
  );
}
