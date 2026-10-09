PY ?= python3

.PHONY: data build site serve export clean

# synthetic files + bronze tables
data:
	$(PY) ingestion/generate_and_load.py

# seed, models, tests, unit tests
build:
	dbt build

# everything the project site needs, written to site/
site: data build
	$(PY) scripts/export_site_data.py
	dbt docs generate
	mkdir -p site/dbt-docs
	cp target/index.html target/manifest.json target/catalog.json site/dbt-docs/

serve:
	$(PY) -m http.server 8000 --directory site

# CSV and Parquet files of the gold layer, for Power BI
export:
	$(PY) scripts/export_gold.py

clean:
	rm -rf target logs data exports site/data site/dbt-docs telehealth.duckdb telehealth.duckdb.wal
