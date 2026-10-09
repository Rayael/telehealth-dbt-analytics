{# Deterministic surrogate key: md5 of the business key columns. #}
{% macro surrogate_key(fields) -%}
    md5(concat_ws('||'
    {%- for f in fields -%}
        , coalesce(cast({{ f }} as varchar), '_null_')
    {%- endfor -%}
    ))
{%- endmacro %}

{# Key of the "unknown member" row that every dimension carries (Kimball). #}
{% macro unknown_key() -%}
    {{ surrogate_key(["'-1'"]) }}
{%- endmacro %}
