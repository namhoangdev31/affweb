import { createAffiliateLink } from "../src/modules/links/service";
import { db } from "../src/lib/db";

async function testService() {
  const user = await db.user.findFirst();
  if (!user) {
    console.log("No user found");
    return;
  }

  const url = "https://vn.shp.ee/tjhvflhj?smtt=0.0.9";
  console.log("Testing createAffiliateLink with URL:", url);

  try {
    const result = await createAffiliateLink({
      userId: user.id,
      url
    });
    console.log("createAffiliateLink Result:", JSON.stringify(result, null, 2));
  } catch (err) {
    console.error("createAffiliateLink Error:", err);
  }
}

testService();
