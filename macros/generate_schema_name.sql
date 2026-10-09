{#
  Use the custom schema as is (silver, gold) instead of the default
  <target_schema>_<custom_schema> naming, so the medallion layers
  are plain schemas in the warehouse.
#}
{% macro generate_schema_name(custom_schema_name, node) -%}
    {%- if custom_schema_name is none -%}
        {{ target.schema }}
    {%- else -%}
        {{ custom_schema_name | trim }}
    {%- endif -%}
{%- endmacro %}
