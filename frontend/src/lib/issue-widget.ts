import pkg from "../../package.json";

/**
 * Feedback widget (Linear issue requests). The script builds its own button
 * and iframe; its styles live in Shadow DOM / the iframe. Origin, Linear team
 * and project mapping and the API key stay on the widget server.
 */
export const ISSUE_WIDGET_SRC = "https://issue.technowide.tr/embed.js";

export const ISSUE_WIDGET_RELEASE = pkg.version;

export const ISSUE_WIDGET_ENVIRONMENT =
  process.env.NODE_ENV === "production" ? "staging" : "development";

/**
 * Calls the widget API, or queues the call when the script has not run yet
 * (it drains `window.LinearWidget.q` on load).
 */
export function callIssueWidget(call: LinearWidgetCall) {
  if (typeof window === "undefined") return;
  const widget = window.LinearWidget;
  const [method, arg] = call;
  const fn = widget?.[method] as ((value: typeof arg) => void) | undefined;
  if (typeof fn === "function") {
    fn.call(widget, arg);
    return;
  }
  const target = widget ?? (window.LinearWidget = {});
  (target.q ??= []).push(call);
}

/**
 * Customer-facing pages (customer portal, pay links, remote approval,
 * deposit pre-authorization) never run the feedback widget: it is a staff
 * tool and records the page (console, network, session replay), which has
 * no place next to a renter's personal data (TEC-1284). The widget stops
 * when its host element already exists, so this guard, run before it,
 * claims the element on those paths.
 */
export const CUSTOMER_PATHS = /^\/(r|pay|d|deposit-preauth)(\/|$)/;

export const ISSUE_WIDGET_GUARD = `(function(){try{if(${CUSTOMER_PATHS.toString()}.test(location.pathname)){var h=document.createElement("div");h.id="lpi-embed-host";h.hidden=true;document.documentElement.appendChild(h);}}catch(e){}})();`;
