import { requirePlatformAdmin } from "@/lib/admin";
import { Card } from "@/components/ui";
import { DiscountForm } from "./discount-form";
import { ToggleDiscountButton } from "./toggle-discount-button";

export const dynamic = "force-dynamic";

interface DiscountRow {
  id: string;
  name: string;
  percent_off: number;
  is_active: boolean;
}

export default async function AdminDiscountsPage() {
  const { supabase } = await requirePlatformAdmin();
  const { data, error } = await supabase
    .from("discounts")
    .select("id, name, percent_off, is_active")
    .order("percent_off");
  if (error) throw new Error(error.message);
  const discounts = (data ?? []) as DiscountRow[];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Discounts</h2>
        <p className="text-sm text-slate-500">
          Reusable discount definitions. Assign one to a user from the Users page — it stays active until you remove
          it there.
        </p>
      </div>

      <Card>
        <ul className="divide-y divide-slate-100">
          {discounts.map((d) => (
            <li key={d.id} className="py-2 flex items-center justify-between gap-3">
              <div>
                <span className="font-medium">{d.name}</span>{" "}
                <span className="text-sm text-slate-500">({d.percent_off}% off)</span>
              </div>
              <ToggleDiscountButton id={d.id} isActive={d.is_active} />
            </li>
          ))}
        </ul>
      </Card>

      <Card title="Add a new discount">
        <DiscountForm />
      </Card>
    </div>
  );
}
