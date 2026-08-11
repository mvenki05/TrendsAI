export interface Report {
  report_id: string;
  filename: string;
  title: string | null;
  document_date: string | null;
  source_type: string | null;
  num_megatrends: number | null;
  num_nodes: number | null;
  status: string | null;
  uploaded_at: string;
}

export interface TaxonomyNode {
  node_id: string;
  report_id: string;
  parent_id: string | null;
  level: "megatrend" | "subtrend" | "product" | "ingredient" | "behaviour" | "psychographic";
  name: string;
  description: string | null;
  search_term: string | null;
  megatrend_name: string | null;
  subtrend_name: string | null;
}

export interface TrendSearch {
  search_id: string;
  report_id: string;
  node_id: string;
  node_level: string | null;
  term: string;
  node_name: string | null;
  subtrend_name: string | null;
  megatrend_name: string | null;
  current_interest: number | null;
  yoy_growth: number | null;
  is_rising: boolean | null;
  has_data: boolean | null;
  interest_series: string | null; // JSON array of weekly interest ints (0-100)
}

export interface MegatrendCluster {
  cluster_id: string;
  cluster_name: string;
  description: string | null;
  source_report_ids: string[];
  source_megatrend_names: string[];
  source_filenames: string[];
  file_count: number;
  rising_search_count: number;
  best_score: number;
}

// A source backing a web-discovered item.
export interface DiscoverySource {
  title: string;
  url: string | null;
  source: string;
}

// A taxonomy item discovered from the open web (not the deck), aligned to a megatrend.
// level "innovation" = global novel concept; "us_product" = new-in-US-market retail product
// (for us_product rows, `megatrend` holds the universe category: Protein / Snacking / Lunch / Breakfast / Dinner).
export interface DiscoveredNode {
  discovery_id: string;
  megatrend: string;
  level: "subtrend" | "product" | "ingredient" | "behaviour" | "psychographic" | "innovation" | "us_product";
  name: string;
  search_term: string | null;
  support: number | null;       // distinct web sources corroborating
  sources: string | null;       // JSON array of DiscoverySource
  in_deck: boolean | null;      // also in the uploaded deck? (false = newly discovered)
  current_interest: number | null;
  yoy_growth: number | null;
  is_rising: boolean | null;
  has_data: boolean | null;
  interest_series: string | null;   // JSON weekly interest series (after validation)
  classification: string | null;    // trend-math verdict (durable / low-base / volatile-fad / …)
  acceleration: number | null;      // >0 = still climbing
  is_durable: boolean | null;       // rising + accelerating + low volatility
  description: string | null;       // what this discovered item is (grounded definition)
  relation: string | null;          // how it relates to the parent megatrend
  subtrend: string | null;          // the subtrend lens this was discovered under
  mapped_megatrend: string | null;  // for us_product rows: which megatrend this product expresses
  mega_description: string | null;   // description of the parent megatrend cluster
}

// Combined payload for a single report's drill-down view.
export interface ReportDetail {
  report: Report | null;
  nodes: TaxonomyNode[];
  searches: TrendSearch[];
}
