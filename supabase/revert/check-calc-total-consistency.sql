-- READ-ONLY pre-checks for migrations 0044 and 0045. Run in the SQL editor
-- BEFORE applying them (and compare with check-real-contracts.sql as usual).
-- Each query should return zero rows for the new rules to be a no-op on
-- existing data.

-- (1) 0045 rule 2: calculations whose total_amount differs from
--     result.totalAmount by 0.5 VND or more, or whose result has no totalAmount.
select c.id, k.code as hop_dong, c.status, c.period_month, c.is_demo,
       c.total_amount, c.result ->> 'totalAmount' as result_total
from public.billing_rent_calculations c
join public.billing_contracts k on k.id = c.contract_id
where c.result -> 'totalAmount' is null
   or jsonb_typeof(c.result -> 'totalAmount') <> 'number'
   or abs(c.total_amount - (c.result ->> 'totalAmount')::numeric) >= 0.5
order by c.created_at desc;

-- (2) 0044: period data edited AFTER the period was confirmed (evidence that the
--     old app-only lock was bypassed, or that an admin edited then re-confirmed).
select k.code as hop_dong, c.period_month, c.confirmed_at,
       i.updated_at as period_input_updated_at, i.paid_in_period,
       i.opening_debt_override
from public.billing_rent_calculations c
join public.billing_contracts k on k.id = c.contract_id
join public.billing_period_inputs i
  on i.contract_id = c.contract_id and i.period_from = c.period_from
where c.status = 'confirmed' and i.updated_at > c.confirmed_at
order by c.confirmed_at desc;

select k.code as hop_dong, c.period_month, c.confirmed_at,
       'transport' as bang, t.updated_at
from public.billing_rent_calculations c
join public.billing_contracts k on k.id = c.contract_id
join public.billing_period_inputs i
  on i.contract_id = c.contract_id and i.period_from = c.period_from
join public.billing_period_transport t on t.period_input_id = i.id
where c.status = 'confirmed' and t.updated_at > c.confirmed_at
union all
select k.code, c.period_month, c.confirmed_at, 'deductions', d.updated_at
from public.billing_rent_calculations c
join public.billing_contracts k on k.id = c.contract_id
join public.billing_period_inputs i
  on i.contract_id = c.contract_id and i.period_from = c.period_from
join public.billing_period_deductions d on d.period_input_id = i.id
where c.status = 'confirmed' and d.updated_at > c.confirmed_at
order by 3 desc;
