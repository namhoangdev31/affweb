import { clerkClient } from "@clerk/nextjs/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PaginationNav } from "@/components/pagination-nav";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import {
  AccountDeletionStatus,
  IdentityInvitationStatus,
  Role,
  UserStatus
} from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { paginationPage } from "@/lib/pagination";
import { formatVnd } from "@/lib/utils";
import {
  approveDeletionRequestAction,
  inviteUserAction,
  resendInvitationAction,
  revokeInvitationAction,
  revokeUserSessionsAction,
  setUserRoleAction,
  updateUserStatusAction
} from "./actions";

const PAGE_SIZE = 20;

export default async function AdminUsersPage({
  searchParams
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const params = await searchParams;
  const totalUsers = await db.user.count();
  const currentPage = paginationPage(params.page, totalUsers, PAGE_SIZE);
  const users = await db.user.findMany({
    include: {
      roles: true,
      wallet: true,
      identityInvitations: { orderBy: { createdAt: "desc" }, take: 1 },
      deletionRequests: { orderBy: { requestedAt: "desc" }, take: 1 }
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: (currentPage - 1) * PAGE_SIZE,
    take: PAGE_SIZE
  });
  const clerkIds = users.flatMap((user) => (user.clerkUserId ? [user.clerkUserId] : []));
  const clerkUsers =
    clerkIds.length > 0
      ? (await (await clerkClient()).users.getUserList({ userId: clerkIds, limit: PAGE_SIZE })).data
      : [];
  const clerkById = new Map(clerkUsers.map((user) => [user.id, user]));

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
            Clerk gửi lời mời beta; người dùng đăng nhập bằng Google hoặc email OTP.
          </p>
        </CardContent>
      </Card>
      <Card className="mt-8 hidden overflow-hidden py-0 xl:block">
        <Table className="min-w-[1200px]">
          <TableHeader className="bg-muted/50">
            <TableRow>
              <TableHead className="pl-5">Người dùng</TableHead>
              <TableHead>Trạng thái</TableHead>
              <TableHead>Roles</TableHead>
              <TableHead className="text-right">Available</TableHead>
              <TableHead>Identity</TableHead>
              <TableHead className="pr-5">Quản trị</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((user) => {
              const clerkUser = user.clerkUserId ? clerkById.get(user.clerkUserId) : undefined;
              const invitation = user.identityInvitations[0];
              const deletion = user.deletionRequests[0];
              return (
                <TableRow key={user.id}>
                  <TableCell className="pl-5">
                    <p className="font-medium">{user.name ?? "Chưa đặt tên"}</p>
                    <p className="text-xs text-muted-foreground">{user.email}</p>
                  </TableCell>
                  <TableCell>
                    <Badge variant={user.status === UserStatus.ACTIVE ? "default" : "outline"}>
                      {user.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex max-w-52 flex-wrap gap-1">
                      {user.roles.map((role) => (
                        <Badge key={role.id} variant="secondary">
                          {role.role}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-semibold">
                    {formatVnd(user.wallet?.availableVnd ?? 0n)}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{user.identityState}</Badge>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {clerkUser?.lastSignInAt
                        ? new Date(clerkUser.lastSignInAt).toLocaleString("vi-VN", {
                            timeZone: "Asia/Ho_Chi_Minh"
                          })
                        : "Chưa đăng nhập"}
                    </p>
                    {invitation ? <p className="text-xs">Invite: {invitation.status}</p> : null}
                    {deletion ? (
                      <p className="text-xs text-destructive">Xóa: {deletion.status}</p>
                    ) : null}
                  </TableCell>
                  <TableCell className="pr-5">
                    <details>
                      <summary className="cursor-pointer text-sm font-medium">Mở thao tác</summary>
                      <div className="mt-3 grid min-w-72 gap-3">
                        <form action={setUserRoleAction} className="flex gap-2">
                          <input type="hidden" name="userId" value={user.id} />
                          <select
                            name="role"
                            className="h-9 rounded-md border bg-background px-2 text-sm"
                          >
                            {Object.values(Role).map((role) => (
                              <option key={role} value={role}>
                                {role}
                              </option>
                            ))}
                          </select>
                          <Button
                            name="assigned"
                            value="true"
                            type="submit"
                            size="sm"
                            variant="outline"
                          >
                            Cấp
                          </Button>
                          <Button
                            name="assigned"
                            value="false"
                            type="submit"
                            size="sm"
                            variant="ghost"
                          >
                            Gỡ
                          </Button>
                        </form>
                        <form action={updateUserStatusAction} className="flex gap-2">
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
                        {user.clerkUserId ? (
                          <form action={revokeUserSessionsAction}>
                            <input type="hidden" name="userId" value={user.id} />
                            <Button type="submit" size="sm" variant="ghost">
                              Thu hồi session
                            </Button>
                          </form>
                        ) : null}
                        {invitation && invitation.status !== IdentityInvitationStatus.ACCEPTED ? (
                          <div className="flex gap-2">
                            <form action={resendInvitationAction}>
                              <input type="hidden" name="invitationId" value={invitation.id} />
                              <Button type="submit" size="sm" variant="outline">
                                Gửi lại invite
                              </Button>
                            </form>
                            {invitation.status === IdentityInvitationStatus.SENT ? (
                              <form action={revokeInvitationAction}>
                                <input type="hidden" name="invitationId" value={invitation.id} />
                                <Button type="submit" size="sm" variant="ghost">
                                  Thu hồi invite
                                </Button>
                              </form>
                            ) : null}
                          </div>
                        ) : null}
                        {deletion &&
                        (
                          [
                            AccountDeletionStatus.REQUESTED,
                            AccountDeletionStatus.BLOCKED
                          ] as AccountDeletionStatus[]
                        ).includes(deletion.status) ? (
                          <form action={approveDeletionRequestAction}>
                            <input type="hidden" name="requestId" value={deletion.id} />
                            <Button type="submit" size="sm" variant="destructive">
                              Kiểm tra và duyệt xóa
                            </Button>
                          </form>
                        ) : null}
                      </div>
                    </details>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>
      <div className="mt-8 space-y-3 xl:hidden">
        {users.map((user) => {
          const clerkUser = user.clerkUserId ? clerkById.get(user.clerkUserId) : undefined;
          const invitation = user.identityInvitations[0];
          const deletion = user.deletionRequests[0];
          return (
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
                  <Badge className="ml-2 mt-2" variant="outline">
                    Clerk: {user.identityState}
                  </Badge>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Đăng nhập gần nhất:{" "}
                    {clerkUser?.lastSignInAt
                      ? new Date(clerkUser.lastSignInAt).toLocaleString("vi-VN", {
                          timeZone: "Asia/Ho_Chi_Minh"
                        })
                      : "—"}
                  </p>
                  {invitation ? (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <Badge variant="secondary">Invite: {invitation.status}</Badge>
                      {invitation.status !== IdentityInvitationStatus.ACCEPTED ? (
                        <>
                          <form action={resendInvitationAction}>
                            <input type="hidden" name="invitationId" value={invitation.id} />
                            <Button type="submit" size="sm" variant="outline">
                              Gửi lại
                            </Button>
                          </form>
                          {invitation.status === IdentityInvitationStatus.SENT ? (
                            <form action={revokeInvitationAction}>
                              <input type="hidden" name="invitationId" value={invitation.id} />
                              <Button type="submit" size="sm" variant="ghost">
                                Thu hồi
                              </Button>
                            </form>
                          ) : null}
                        </>
                      ) : null}
                    </div>
                  ) : null}
                  {deletion ? (
                    <div className="mt-3 rounded-lg border p-3 text-xs">
                      <p>
                        Yêu cầu xóa: <strong>{deletion.status}</strong>
                      </p>
                      {deletion.blockedReason ? (
                        <p className="mt-1 text-destructive">{deletion.blockedReason}</p>
                      ) : null}
                      {(
                        [
                          AccountDeletionStatus.REQUESTED,
                          AccountDeletionStatus.BLOCKED
                        ] as AccountDeletionStatus[]
                      ).includes(deletion.status) ? (
                        <form action={approveDeletionRequestAction} className="mt-2">
                          <input type="hidden" name="requestId" value={deletion.id} />
                          <Button type="submit" size="sm" variant="destructive">
                            Kiểm tra và duyệt xóa
                          </Button>
                        </form>
                      ) : null}
                    </div>
                  ) : null}
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
                    <select
                      name="role"
                      className="h-9 rounded-md border bg-background px-2 text-sm"
                    >
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
                  {user.clerkUserId ? (
                    <form action={revokeUserSessionsAction} className="mt-2">
                      <input type="hidden" name="userId" value={user.id} />
                      <Button type="submit" size="sm" variant="ghost">
                        Thu hồi mọi session
                      </Button>
                    </form>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
      {users.length ? (
        <div className="mt-4">
          <PaginationNav
            currentPage={currentPage}
            totalItems={totalUsers}
            pageSize={PAGE_SIZE}
            pathname="/admin/users"
            itemLabel="người dùng"
          />
        </div>
      ) : null}
    </div>
  );
}
