"""
TrendLens — BigQuery Schema Setup

Creates the dataset and the 4 tables for the upload-driven trend system:
  reports           — one row per uploaded file (provenance + timestamp)
  taxonomy_nodes    — the extracted tree: megatrend → subtrend → products/
                      ingredients/behaviours/psychographics
  trend_searches    — real Google Trends queries (Top = famous, Rising = growing)
                      mapped to each megatrend/subtrend
  megatrend_clusters — cross-file synthesis: canonical "best" megatrends ranked
                      by corroboration (how many files) + real rising-search momentum

Usage:
    python scripts/setup_bigquery.py            # create tables (idempotent)
    python scripts/setup_bigquery.py --drop-old # drop legacy TrendPulse tables first
    python scripts/setup_bigquery.py --reset    # drop the 4 new tables and recreate
"""

import argparse
import logging
import os
from pathlib import Path

import yaml
from dotenv import load_dotenv
from google.api_core.exceptions import NotFound
from google.cloud import bigquery

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)


def load_settings() -> dict:
    config_path = Path(__file__).parent.parent / "config" / "settings.yaml"
    with open(config_path) as f:
        return yaml.safe_load(f)


# ---------------------------------------------------------------------------
# Table schemas
# ---------------------------------------------------------------------------

TABLES: dict[str, list[bigquery.SchemaField]] = {
    "reports": [
        bigquery.SchemaField("report_id", "STRING", mode="REQUIRED", description="Unique id for this uploaded file"),
        bigquery.SchemaField("filename", "STRING", mode="REQUIRED", description="Original uploaded file name"),
        bigquery.SchemaField("title", "STRING", mode="NULLABLE", description="Document title / overall theme (AI-extracted)"),
        bigquery.SchemaField("document_date", "STRING", mode="NULLABLE", description="Date/period the report states about itself (coverage period or publication date, as written). Null if none stated."),
        bigquery.SchemaField("source_type", "STRING", mode="NULLABLE", description="pptx / pdf"),
        bigquery.SchemaField("num_megatrends", "INT64", mode="NULLABLE", description="Megatrends extracted from this file"),
        bigquery.SchemaField("num_nodes", "INT64", mode="NULLABLE", description="Total taxonomy nodes extracted"),
        bigquery.SchemaField("raw_text_chars", "INT64", mode="NULLABLE", description="Characters of text extracted from the file"),
        bigquery.SchemaField("status", "STRING", mode="NULLABLE", description="extracted / mapped / synthesized"),
        bigquery.SchemaField("text_hash", "STRING", mode="NULLABLE", description="SHA-256 of the extracted text — lets re-uploads skip re-extraction when content is unchanged"),
        bigquery.SchemaField("uploaded_at", "TIMESTAMP", mode="REQUIRED", description="When the file was uploaded/processed"),
    ],
    "taxonomy_nodes": [
        bigquery.SchemaField("node_id", "STRING", mode="REQUIRED", description="Unique node id"),
        bigquery.SchemaField("report_id", "STRING", mode="REQUIRED", description="Links to reports.report_id"),
        bigquery.SchemaField("parent_id", "STRING", mode="NULLABLE", description="Parent node id (null for megatrends)"),
        bigquery.SchemaField("level", "STRING", mode="REQUIRED", description="megatrend / subtrend / product / ingredient / behaviour / psychographic"),
        bigquery.SchemaField("name", "STRING", mode="REQUIRED", description="Node name as written in / inferred from the file"),
        bigquery.SchemaField("description", "STRING", mode="NULLABLE", description="Short description from the file"),
        bigquery.SchemaField("search_term", "STRING", mode="NULLABLE", description="Normalized searchable term (products/ingredients)"),
        bigquery.SchemaField("megatrend_name", "STRING", mode="NULLABLE", description="Denormalized: megatrend this node belongs to"),
        bigquery.SchemaField("subtrend_name", "STRING", mode="NULLABLE", description="Denormalized: subtrend this node belongs to"),
        bigquery.SchemaField("created_at", "TIMESTAMP", mode="REQUIRED", description="When extracted"),
    ],
    "trend_searches": [
        bigquery.SchemaField("search_id", "STRING", mode="REQUIRED", description="Unique id"),
        bigquery.SchemaField("report_id", "STRING", mode="REQUIRED", description="Links to reports.report_id"),
        bigquery.SchemaField("node_id", "STRING", mode="REQUIRED", description="The product/ingredient node measured"),
        bigquery.SchemaField("node_level", "STRING", mode="NULLABLE", description="product / ingredient"),
        bigquery.SchemaField("term", "STRING", mode="REQUIRED", description="The normalized search term measured on Google Trends"),
        bigquery.SchemaField("node_name", "STRING", mode="NULLABLE", description="Original node name from the file"),
        bigquery.SchemaField("subtrend_name", "STRING", mode="NULLABLE", description="Denormalized subtrend"),
        bigquery.SchemaField("megatrend_name", "STRING", mode="NULLABLE", description="Denormalized megatrend"),
        bigquery.SchemaField("current_interest", "INT64", mode="NULLABLE", description="Recent 4-week avg Google Trends interest (0-100)"),
        bigquery.SchemaField("yoy_growth", "FLOAT64", mode="NULLABLE", description="Year-over-year % change in interest"),
        bigquery.SchemaField("is_rising", "BOOL", mode="NULLABLE", description="True if meaningfully growing YoY"),
        bigquery.SchemaField("has_data", "BOOL", mode="NULLABLE", description="True if Google Trends returned measurable interest"),
        bigquery.SchemaField("interest_series", "STRING", mode="NULLABLE", description="JSON array of weekly interest ints (0-100, last 12 months) for the trend graph"),
        bigquery.SchemaField("week_of", "DATE", mode="REQUIRED", description="Week this data was captured"),
        bigquery.SchemaField("captured_at", "TIMESTAMP", mode="REQUIRED", description="When captured"),
    ],
    "market_products": [
        bigquery.SchemaField("term", "STRING", mode="REQUIRED", description="Rising ingredient term scanned (cache key, report-independent)"),
        bigquery.SchemaField("product_count", "INT64", mode="NULLABLE", description="Distinct US market products found containing/named for this term"),
        bigquery.SchemaField("brand_count", "INT64", mode="NULLABLE", description="Distinct brands across those products"),
        bigquery.SchemaField("brands", "STRING", mode="REPEATED", description="Top brands (by product popularity) selling products with this term"),
        bigquery.SchemaField("products", "STRING", mode="NULLABLE", description="JSON array of sample products [{name, brand, code, scans, image_url}]"),
        bigquery.SchemaField("has_products", "BOOL", mode="NULLABLE", description="True if any qualifying US food product was found"),
        bigquery.SchemaField("scanned_at", "TIMESTAMP", mode="REQUIRED", description="When Open Food Facts was scanned for this term"),
    ],
    "discovered_nodes": [
        bigquery.SchemaField("discovery_id", "STRING", mode="REQUIRED", description="Unique id"),
        bigquery.SchemaField("megatrend", "STRING", mode="REQUIRED", description="Canonical megatrend cluster this was discovered for"),
        bigquery.SchemaField("level", "STRING", mode="REQUIRED", description="subtrend / product / ingredient / behaviour / psychographic"),
        bigquery.SchemaField("name", "STRING", mode="REQUIRED", description="Discovered item name"),
        bigquery.SchemaField("search_term", "STRING", mode="NULLABLE", description="Normalized term for Google Trends (products/ingredients)"),
        bigquery.SchemaField("support", "INT64", mode="NULLABLE", description="Number of distinct web sources corroborating this item"),
        bigquery.SchemaField("sources", "STRING", mode="NULLABLE", description="JSON array of supporting sources [{title, url, source}]"),
        bigquery.SchemaField("in_deck", "BOOL", mode="NULLABLE", description="True if this also appears in the uploaded deck taxonomy (else newly discovered)"),
        bigquery.SchemaField("current_interest", "INT64", mode="NULLABLE", description="Google Trends recent interest (after validation)"),
        bigquery.SchemaField("yoy_growth", "FLOAT64", mode="NULLABLE", description="YoY % change in interest"),
        bigquery.SchemaField("is_rising", "BOOL", mode="NULLABLE", description="True if rising ≥15% YoY"),
        bigquery.SchemaField("has_data", "BOOL", mode="NULLABLE", description="True if Google Trends returned data"),
        bigquery.SchemaField("interest_series", "STRING", mode="NULLABLE", description="JSON weekly interest series"),
        bigquery.SchemaField("classification", "STRING", mode="NULLABLE", description="Trend-math verdict: durable / rising-accelerating / rising-maturing / volatile-fad / declining / flat / low-base / no-data"),
        bigquery.SchemaField("acceleration", "FLOAT64", mode="NULLABLE", description="Recent momentum minus earlier momentum (>0 = still climbing)"),
        bigquery.SchemaField("volatility", "FLOAT64", mode="NULLABLE", description="Week-over-week noise ratio (higher = more fad-like)"),
        bigquery.SchemaField("is_durable", "BOOL", mode="NULLABLE", description="Rising + accelerating + low volatility (a durable bet, not a spike)"),
        bigquery.SchemaField("parent_id", "STRING", mode="NULLABLE", description="Parent node's discovery_id (products nest under ingredients; children under a subtrend)"),
        bigquery.SchemaField("subtrend", "STRING", mode="NULLABLE", description="The subtrend lens this item was discovered under"),
        bigquery.SchemaField("description", "STRING", mode="NULLABLE", description="Grounded one-line definition of what this discovered item is"),
        bigquery.SchemaField("relation", "STRING", mode="NULLABLE", description="One line on how this item expresses the parent megatrend's meaning"),
        bigquery.SchemaField("discovered_at", "TIMESTAMP", mode="REQUIRED", description="When web discovery ran"),
    ],
    "tyson_products": [
        bigquery.SchemaField("upc", "STRING", mode="REQUIRED", description="Tyson product UPC"),
        bigquery.SchemaField("item", "STRING", mode="NULLABLE", description="Abbreviated NielsenIQ product name (e.g. 'TYSN TRYK FLVR PRK')"),
        bigquery.SchemaField("brand", "STRING", mode="NULLABLE", description="Tyson brand (ty_brand)"),
        bigquery.SchemaField("category", "STRING", mode="NULLABLE", description="Tyson category (ty_category)"),
        bigquery.SchemaField("segment", "STRING", mode="NULLABLE", description="Tyson segment (ty_segment)"),
        bigquery.SchemaField("refreshed_at", "TIMESTAMP", mode="REQUIRED", description="When pulled from pos_enriched_mat"),
    ],
    "tyson_matches": [
        bigquery.SchemaField("term", "STRING", mode="REQUIRED", description="Rising ingredient term (cache key)"),
        bigquery.SchemaField("match_count", "INT64", mode="NULLABLE", description="Tyson products matched to this term"),
        bigquery.SchemaField("matches", "STRING", mode="NULLABLE", description="JSON array of matched Tyson products [{item, brand, category}]"),
        bigquery.SchemaField("has_match", "BOOL", mode="NULLABLE", description="True if Tyson has a product for this term (else whitespace)"),
        bigquery.SchemaField("matched_at", "TIMESTAMP", mode="REQUIRED", description="When Claude matching ran for this term"),
    ],
    "lab_signals": [
        bigquery.SchemaField("signal_id", "STRING", mode="REQUIRED", description="Unique id"),
        bigquery.SchemaField("source_type", "STRING", mode="REQUIRED", description="news (Google News RSS) / search (BQ public Google Trends rising terms)"),
        bigquery.SchemaField("title", "STRING", mode="REQUIRED", description="Headline (news) or search term (search)"),
        bigquery.SchemaField("url", "STRING", mode="NULLABLE", description="Article link (news only)"),
        bigquery.SchemaField("publisher", "STRING", mode="NULLABLE", description="News outlet (news only)"),
        bigquery.SchemaField("seed_query", "STRING", mode="NULLABLE", description="The unseeded query that surfaced this article (news only)"),
        bigquery.SchemaField("text", "STRING", mode="NULLABLE", description="Fetched body or headline+snippet (news only)"),
        bigquery.SchemaField("percent_gain", "FLOAT64", mode="NULLABLE", description="Max % gain across DMAs (search only)"),
        bigquery.SchemaField("dma_count", "INT64", mode="NULLABLE", description="How many US DMAs list this term as rising (search only)"),
        bigquery.SchemaField("harvested_at", "TIMESTAMP", mode="REQUIRED", description="When harvested"),
    ],
    "lab_ideas": [
        bigquery.SchemaField("idea_id", "STRING", mode="REQUIRED", description="Unique id"),
        bigquery.SchemaField("run_id", "STRING", mode="REQUIRED", description="Scout run this idea came from (page shows the latest run)"),
        bigquery.SchemaField("name", "STRING", mode="REQUIRED", description="The idea as found on the internet (format / flavor-format / occasion play)"),
        bigquery.SchemaField("description", "STRING", mode="NULLABLE", description="Grounded one-line definition from the sources"),
        bigquery.SchemaField("origin", "STRING", mode="NULLABLE", description="Where it exists per the sources (Japan, TikTok, US c-stores, ...)"),
        bigquery.SchemaField("wow", "STRING", mode="NULLABLE", description="The mechanism/format twist that makes it surprising"),
        bigquery.SchemaField("novelty_score", "FLOAT64", mode="NULLABLE", description="0-100 distance from mainstream US retail (LTO flavor ≈ 10, self-heating vending bento ≈ 85)"),
        bigquery.SchemaField("search_term", "STRING", mode="NULLABLE", description="Normalized phrase a US consumer would google (future tracking hook)"),
        bigquery.SchemaField("support", "INT64", mode="NULLABLE", description="Distinct publishers corroborating it"),
        bigquery.SchemaField("sources", "STRING", mode="NULLABLE", description="JSON array of supporting sources [{title, url, source}]"),
        bigquery.SchemaField("closest_known", "STRING", mode="NULLABLE", description="Nearest item the system already tracks (and where it lives)"),
        bigquery.SchemaField("novelty_reason", "STRING", mode="NULLABLE", description="Why nothing in the system covers this"),
        bigquery.SchemaField("buildable", "BOOL", mode="NULLABLE", description="True if Tyson could plausibly make it on existing lines"),
        bigquery.SchemaField("category", "STRING", mode="NULLABLE", description="Best-fit real tyson_products category the idea lands in (buildable only)"),
        bigquery.SchemaField("tyson_brand", "STRING", mode="NULLABLE", description="Best-fit Tyson brand (buildable only)"),
        bigquery.SchemaField("concept_name", "STRING", mode="NULLABLE", description="Tyson-ized concept name (buildable only)"),
        bigquery.SchemaField("pitch", "STRING", mode="NULLABLE", description="One-line Tyson concept pitch (buildable only)"),
        bigquery.SchemaField("fit_score", "FLOAT64", mode="NULLABLE", description="0-100 buildability fit (manufacturing adjacency + brand permission + protein relevance)"),
        bigquery.SchemaField("fit_rationale", "STRING", mode="NULLABLE", description="One sentence on the fit verdict"),
        bigquery.SchemaField("status", "STRING", mode="NULLABLE", description="new / tracking / dismissed"),
        bigquery.SchemaField("current_interest", "INT64", mode="NULLABLE", description="Recent 4-week avg Google Trends interest (after --validate)"),
        bigquery.SchemaField("yoy_growth", "FLOAT64", mode="NULLABLE", description="YoY % change in search interest"),
        bigquery.SchemaField("is_rising", "BOOL", mode="NULLABLE", description="True if meaningfully growing YoY"),
        bigquery.SchemaField("has_data", "BOOL", mode="NULLABLE", description="True if Google Trends returned measurable interest"),
        bigquery.SchemaField("interest_series", "STRING", mode="NULLABLE", description="JSON weekly interest series (12 months)"),
        bigquery.SchemaField("classification", "STRING", mode="NULLABLE", description="Trend-math verdict: durable / rising-accelerating / volatile-fad / declining / flat / low-base / no-data"),
        bigquery.SchemaField("is_durable", "BOOL", mode="NULLABLE", description="Rising + accelerating + low volatility"),
        bigquery.SchemaField("created_at", "TIMESTAMP", mode="REQUIRED", description="When the scout run wrote it"),
    ],
    "trend_map_nodes": [
        bigquery.SchemaField("node_id", "STRING", mode="REQUIRED", description="Unique node id"),
        bigquery.SchemaField("parent_id", "STRING", mode="NULLABLE", description="Parent node id (null for megatrends and unassigned evidence)"),
        bigquery.SchemaField("level", "STRING", mode="REQUIRED", description="megatrend / subtrend / product / ingredient / behaviour / psychographic"),
        bigquery.SchemaField("name", "STRING", mode="REQUIRED", description="Node name, derived from harvested evidence"),
        bigquery.SchemaField("description", "STRING", mode="NULLABLE", description="Grounded one-line definition"),
        bigquery.SchemaField("geo", "STRING", mode="NULLABLE", description="US / global / country-or-region the evidence places it in"),
        bigquery.SchemaField("search_term", "STRING", mode="NULLABLE", description="Normalized Google Trends term (products/ingredients)"),
        bigquery.SchemaField("support", "INT64", mode="NULLABLE", description="Distinct publishers corroborating this entity"),
        bigquery.SchemaField("sources", "STRING", mode="NULLABLE", description="JSON array of supporting sources [{title, url, source}]"),
        bigquery.SchemaField("megatrend_name", "STRING", mode="NULLABLE", description="Denormalized: our megatrend this node belongs to"),
        bigquery.SchemaField("subtrend_name", "STRING", mode="NULLABLE", description="Denormalized: our subtrend this node belongs to"),
        bigquery.SchemaField("overlap_deck", "STRING", mode="NULLABLE", description="Matching uploaded-deck megatrend (megatrend level; null = new vs decks)"),
        bigquery.SchemaField("evidence_origin", "STRING", mode="NULLABLE", description="news (map harvest) / scout (White Space finds)"),
        bigquery.SchemaField("created_at", "TIMESTAMP", mode="REQUIRED", description="When the map build ran"),
    ],
    "lab_subtrends": [
        bigquery.SchemaField("subtrend_id", "STRING", mode="REQUIRED", description="Unique id"),
        bigquery.SchemaField("name", "STRING", mode="REQUIRED", description="Emerging subtrend name, derived bottom-up from scout finds"),
        bigquery.SchemaField("description", "STRING", mode="NULLABLE", description="What the subtrend is, grounded in the member ideas"),
        bigquery.SchemaField("idea_names", "STRING", mode="NULLABLE", description="JSON array of member lab_ideas names (cite-or-die)"),
        bigquery.SchemaField("member_count", "INT64", mode="NULLABLE", description="Number of scout finds forming this subtrend"),
        bigquery.SchemaField("run_count", "INT64", mode="NULLABLE", description="Distinct scout runs the members came from (persistence)"),
        bigquery.SchemaField("rising_count", "INT64", mode="NULLABLE", description="Members with rising Google Trends demand (after validation)"),
        bigquery.SchemaField("maps_to_megatrend", "STRING", mode="NULLABLE", description="Existing megatrend this expresses (null = genuinely new territory)"),
        bigquery.SchemaField("created_at", "TIMESTAMP", mode="REQUIRED", description="When clustering ran"),
    ],
    "megatrend_clusters": [
        bigquery.SchemaField("cluster_id", "STRING", mode="REQUIRED", description="Unique cluster id"),
        bigquery.SchemaField("cluster_name", "STRING", mode="REQUIRED", description="Canonical megatrend name across files"),
        bigquery.SchemaField("description", "STRING", mode="NULLABLE", description="Synthesized description"),
        bigquery.SchemaField("source_report_ids", "STRING", mode="REPEATED", description="Reports that contributed to this cluster"),
        bigquery.SchemaField("source_megatrend_names", "STRING", mode="REPEATED", description="Original megatrend names from each file"),
        bigquery.SchemaField("source_filenames", "STRING", mode="REPEATED", description="Filenames that mention this megatrend"),
        bigquery.SchemaField("file_count", "INT64", description="How many files corroborate this megatrend"),
        bigquery.SchemaField("rising_search_count", "INT64", description="Total rising searches across this cluster's megatrends"),
        bigquery.SchemaField("best_score", "FLOAT64", description="Ranking key: derived from file_count + rising_search_count (both real)"),
        bigquery.SchemaField("synthesized_at", "TIMESTAMP", mode="REQUIRED", description="When the cross-file synthesis ran"),
    ],
}

TABLE_CONFIG: dict[str, dict] = {
    "reports": {"partition_field": "uploaded_at", "partition_type": "MONTH", "clustering_fields": ["report_id"]},
    "taxonomy_nodes": {"partition_field": "created_at", "partition_type": "MONTH", "clustering_fields": ["report_id", "level"]},
    "trend_searches": {"partition_field": "week_of", "partition_type": "MONTH", "clustering_fields": ["report_id", "megatrend_name"]},
    "market_products": {"partition_field": "scanned_at", "partition_type": "MONTH", "clustering_fields": ["term"]},
    "discovered_nodes": {"partition_field": "discovered_at", "partition_type": "MONTH", "clustering_fields": ["megatrend", "level"]},
    "tyson_products": {"partition_field": "refreshed_at", "partition_type": "MONTH", "clustering_fields": ["upc"]},
    "tyson_matches": {"partition_field": "matched_at", "partition_type": "MONTH", "clustering_fields": ["term"]},
    "megatrend_clusters": {"partition_field": "synthesized_at", "partition_type": "MONTH", "clustering_fields": ["cluster_id"]},
    "lab_signals": {"partition_field": "harvested_at", "partition_type": "MONTH", "clustering_fields": ["source_type"]},
    "lab_ideas": {"partition_field": "created_at", "partition_type": "MONTH", "clustering_fields": ["run_id"]},
    "lab_subtrends": {"partition_field": "created_at", "partition_type": "MONTH", "clustering_fields": ["subtrend_id"]},
    "trend_map_nodes": {"partition_field": "created_at", "partition_type": "MONTH", "clustering_fields": ["level", "megatrend_name"]},
}

# Legacy tables removed in teardowns (TrendPulse originals + the retired bottom-up Trend Lab).
LEGACY_TABLES = [
    "google_trends_weekly", "google_trends_derived", "reddit_posts", "keyword_volumes",
    "trend_signals", "opportunity_scores", "opportunity_analytics", "yelp_signals",
    "discovered_terms", "innovation_signals", "circana_reference", "mega_trend_signals",
    "lab_entities", "lab_megatrends",
]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def create_dataset(client: bigquery.Client, project_id: str, dataset_id: str, location: str) -> None:
    dataset = bigquery.Dataset(f"{project_id}.{dataset_id}")
    dataset.location = location
    dataset.description = "TrendLens — upload-driven trend intelligence"
    client.create_dataset(dataset, exists_ok=True)
    logger.info("Dataset %s.%s ready", project_id, dataset_id)


def create_table(client, project_id, dataset_id, name, schema, config) -> None:
    table_ref = f"{project_id}.{dataset_id}.{name}"
    table = bigquery.Table(table_ref, schema=schema)
    if "partition_field" in config:
        table.time_partitioning = bigquery.TimePartitioning(
            type_=bigquery.TimePartitioningType.MONTH, field=config["partition_field"]
        )
    if "clustering_fields" in config:
        table.clustering_fields = config["clustering_fields"]
    table.description = f"TrendLens — {name}"
    try:
        client.get_table(table_ref)
        logger.info("Table %s already exists — skipping", name)
        return
    except NotFound:
        pass
    client.create_table(table)
    logger.info("Created table %s", name)


def drop_tables(client, project_id, dataset_id, names) -> None:
    for name in names:
        client.delete_table(f"{project_id}.{dataset_id}.{name}", not_found_ok=True)
        logger.info("Dropped table %s (if it existed)", name)


def main() -> None:
    parser = argparse.ArgumentParser(description="TrendLens BigQuery Setup")
    parser.add_argument("--drop-old", action="store_true", help="Drop legacy TrendPulse tables")
    parser.add_argument("--reset", action="store_true", help="Drop and recreate the 4 new tables")
    args = parser.parse_args()

    settings = load_settings()
    bq = settings["bigquery"]
    project_id = os.getenv("BIGQUERY_PROJECT", bq["project_id"])
    dataset_id = os.getenv("BIGQUERY_DATASET", bq["dataset"])
    location = bq["location"]

    client = bigquery.Client(project=project_id)
    create_dataset(client, project_id, dataset_id, location)

    if args.drop_old:
        logger.info("Dropping legacy tables...")
        drop_tables(client, project_id, dataset_id, LEGACY_TABLES)

    if args.reset:
        logger.info("Resetting new tables...")
        drop_tables(client, project_id, dataset_id, list(TABLES))

    for name, schema in TABLES.items():
        create_table(client, project_id, dataset_id, name, schema, TABLE_CONFIG.get(name, {}))

    logger.info("Schema ready: %d tables", len(TABLES))


if __name__ == "__main__":
    main()
