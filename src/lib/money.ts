// Display-only money formatting, safe for client components. Amounts arrive as
// decimal strings from the server; this never does arithmetic on them.
export function formatMoney(amount: string, currency: string): string {
  const [whole, fraction = "00"] = amount.split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const symbol = currency === "PKR" ? "Rs" : currency;
  return `${symbol} ${grouped}.${fraction.padEnd(2, "0").slice(0, 2)}`;
}
