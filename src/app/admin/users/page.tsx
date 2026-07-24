import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Role, UserStatus } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { formatVnd } from "@/lib/utils";
import { inviteUserAction, setUserRoleAction, updateUserStatusAction } from "./actions";

export default async function AdminUsersPage() {
  const users = await db.user.findMany({
    include: { roles: true, wallet: true },
    orderBy: { createdAt: "desc" },
    take: 100
  });
  return (
    <div>
      <h1 className="display-type text-4xl">Người dùng.</h1>
      <Card className="mt-8">
        <CardContent className="p-5">
          <form action={inviteUserAction} className="flex flex-col gap-3 sm:flex-row">
            <Input
              name="email"
              type="email"
              required
              placeholder="email@congty.vn"
              aria-label="Email người được mời"
            />
            <Button type="submit">Mời vào beta</Button>
          </form>
          <p className="mt-2 text-xs text-muted-foreground">
            Người được mời đăng nhập bằng magic link hoặc Google với đúng email này.
          </p>
        </CardContent>
      </Card>
      <div className="mt-8 space-y-3">
        {users.map((user) => (
          <Card key={user.id}>
            <CardContent className="grid gap-5 p-5 xl:grid-cols-[1fr_auto_auto] xl:items-center">
              <div className="min-w-0 flex-1">
                <p className="font-medium">{user.name ?? "Chưa đặt tên"}</p>
                <p className="text-sm text-muted-foreground">{user.email}</p>
                <Badge
                  className="mt-2"
                  variant={user.status === UserStatus.ACTIVE ? "default" : "outline"}
                >
                  {user.status}
                </Badge>
              </div>
              <div>
                <div className="flex flex-wrap gap-1">
                  {user.roles.map((role) => (
                    <Badge key={role.id} variant="secondary">
                      {role.role}
                    </Badge>
                  ))}
                </div>
                <form action={setUserRoleAction} className="mt-3 flex flex-wrap gap-2">
                  <input type="hidden" name="userId" value={user.id} />
                  <select name="role" className="h-9 rounded-md border bg-background px-2 text-sm">
                    {Object.values(Role).map((role) => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))}
                  </select>
                  <Button name="assigned" value="true" type="submit" size="sm" variant="outline">
                    Cấp role
                  </Button>
                  <Button name="assigned" value="false" type="submit" size="sm" variant="ghost">
                    Gỡ role
                  </Button>
                </form>
              </div>
              <div className="xl:text-right">
                <p className="font-semibold">{formatVnd(user.wallet?.availableVnd ?? 0n)}</p>
                <p className="text-xs text-muted-foreground">available</p>
                <form action={updateUserStatusAction} className="mt-3 flex gap-2">
                  <input type="hidden" name="userId" value={user.id} />
                  <select
                    name="status"
                    defaultValue={user.status}
                    className="h-9 rounded-md border bg-background px-2 text-sm"
                  >
                    {Object.values(UserStatus).map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                  <Button type="submit" size="sm" variant="outline">
                    Cập nhật
                  </Button>
                </form>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
