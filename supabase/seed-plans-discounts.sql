-- Seed the initial membership plans and discount definitions. Idempotent:
-- safe to re-run (keys/names are unique-guarded).

insert into membership_plans (key, name, monthly_price_cents, tier_level, description, sort_order)
values
  ('essential', 'Essential', 6000, 1, 'Compare guidelines from the Top 12 Non-QM lenders.', 1),
  ('professional', 'Professional', 7900, 2, 'Compare guidelines from the Top 25 Non-QM lenders.', 2),
  ('enterprise', 'Enterprise', 10000, 3, 'Full access to every Non-QM lender in the platform, including future additions.', 3)
on conflict (key) do update set
  name = excluded.name,
  monthly_price_cents = excluded.monthly_price_cents,
  tier_level = excluded.tier_level,
  description = excluded.description,
  sort_order = excluded.sort_order;

insert into discounts (name, percent_off)
select '50% Off', 50
where not exists (select 1 from discounts where name = '50% Off');

insert into discounts (name, percent_off)
select '100% Off (Free Membership)', 100
where not exists (select 1 from discounts where name = '100% Off (Free Membership)');
