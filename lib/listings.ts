// Builds real, working search-result URLs on major marketplaces, pre-filled
// with the user's location, radius, price ceiling, and the recommended
// make/model — instead of just linking to a manufacturer homepage.
//
// These three URL schemes were verified by hand against the live sites
// before being encoded here:
//   - Autotrader: /cars-for-sale/all-cars/{make}/{model}/{zip}?searchRadius=&maxPrice=
//   - TrueCar:    /used-cars-for-sale/listings/{make}/{model}/location-{zip}/
//   - Cars.com:   /shopping/results/?makes[]={make}&stock_type=&maximum_distance=&zip=
// Marketplaces occasionally change query params; if a link ever stops
// filtering correctly the user still lands on a working search page for
// that make and can refine from there.

import type { Vehicle, Condition } from "./types.ts";

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export interface ListingLink {
  site: string;
  label: string;
  url: string;
}

export interface ListingParams {
  zip: string;
  radiusMiles: number;
  maxPrice: number;
  condition: Condition;
}

export function buildListingLinks(v: Vehicle, params: ListingParams): ListingLink[] {
  const zip = (params.zip || "").trim();
  const radius = params.radiusMiles || 50;
  const maxPrice = Math.max(params.maxPrice || v.priceMax, v.priceMin);
  const makeSlug = slugify(v.make);
  const modelSlug = slugify(v.model);
  const stockType = params.condition === "either" ? "" : params.condition; // "new" | "used" | ""

  const links: ListingLink[] = [];

  if (zip) {
    links.push({
      site: "Autotrader",
      label: "Search Autotrader",
      url: `https://www.autotrader.com/cars-for-sale/all-cars/${makeSlug}/${modelSlug}/${encodeURIComponent(
        zip
      )}?searchRadius=${radius}&maxPrice=${Math.round(maxPrice)}`,
    });

    if (params.condition !== "new") {
      links.push({
        site: "TrueCar",
        label: "Search TrueCar (used)",
        url: `https://www.truecar.com/used-cars-for-sale/listings/${makeSlug}/${modelSlug}/location-${encodeURIComponent(
          zip
        )}/`,
      });
    } else {
      links.push({
        site: "TrueCar",
        label: "Search TrueCar (new)",
        url: `https://www.truecar.com/new-cars-for-sale/listings/${makeSlug}/${modelSlug}/location-${encodeURIComponent(
          zip
        )}/`,
      });
    }

    const carsComParams = new URLSearchParams();
    carsComParams.set("makes[]", makeSlug);
    if (stockType) carsComParams.set("stock_type", stockType);
    carsComParams.set("maximum_distance", String(radius));
    carsComParams.set("zip", zip);
    carsComParams.set("list_price_max", String(Math.round(maxPrice)));
    links.push({
      site: "Cars.com",
      label: "Search Cars.com",
      url: `https://www.cars.com/shopping/results/?${carsComParams.toString()}`,
    });
  } else {
    // No zip provided yet — link to a nationwide/make-level search instead
    // of nothing, and let the site prompt the user for location.
    links.push({
      site: "Autotrader",
      label: "Search Autotrader nationwide",
      url: `https://www.autotrader.com/cars-for-sale/all-cars/${makeSlug}/${modelSlug}`,
    });
  }

  if (v.officialSite) {
    links.push({
      site: v.make,
      label: `${v.make} official site`,
      url: `https://www.${v.officialSite}`,
    });
  }

  return links;
}
