import { UserProfile } from "@clerk/nextjs";

export const metadata = { title: "Hồ sơ", robots: { index: false, follow: false } };

export default function ProfilePage() {
  return (
    <div>
      <p className="text-sm text-muted-foreground">Danh tính và thiết bị</p>
      <h1 className="display-type mt-1 text-4xl">Hồ sơ.</h1>
      <div className="mt-8 overflow-x-auto">
        <UserProfile
          routing="path"
          path="/app/profile"
          appearance={{
            elements: {
              navbarButton__apiKeys: "hidden",
              profilePage__apiKeys: "hidden"
            }
          }}
        />
      </div>
    </div>
  );
}
