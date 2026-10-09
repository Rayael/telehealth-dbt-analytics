select consultation_id, started_at, ended_at
from {{ ref('fct_consultation') }}
where ended_at <= started_at
   or started_at < requested_at
