select
    {{ surrogate_key(['triage_code']) }} as triage_key,
    triage_code,
    triage_label,
    urgency_rank,
    max_target_wait_minutes
from {{ ref('ref_triage_level') }}

union all

select
    {{ unknown_key() }},
    '-1',
    'Not triaged',
    null::integer,
    null::integer
