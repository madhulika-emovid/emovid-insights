const { listMonths, getMonthMetadata } = require("./_lib/blobs");

exports.handler = async () => {
  const months = await listMonths();
  const details = await Promise.all(
    months.map(async (m) => ({ month: m, ...(await getMonthMetadata(m)) }))
  );
  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ months: details }),
  };
};
