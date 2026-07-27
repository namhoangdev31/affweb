import { NextResponse } from "next/server";
import { registerTenantWithTrial } from "@/lib/tenant";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, slug, ownerUserId } = body;

    if (!name || !slug) {
      return NextResponse.json(
        { error: "Vui lòng nhập tên ứng dụng và slug tên miền" },
        { status: 400 }
      );
    }

    const tenant = await registerTenantWithTrial({
      name,
      slug,
      ownerUserId
    });

    return NextResponse.json({
      success: true,
      message: "Tạo không gian làm việc dùng thử 14 ngày thành công!",
      tenant
    });
  } catch (error: any) {
    if (error?.code === "P2002") {
      return NextResponse.json(
        { error: "Slug tên miền đã được sử dụng bởi thương hiệu khác" },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: error?.message || "Lỗi tạo Tenant" },
      { status: 500 }
    );
  }
}
