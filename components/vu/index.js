/* Shared photo-first components. Import from 'components/vu' or a single file. */
export { default as SearchBar, WHEN_OPTIONS } from './SearchBar.jsx';
export { default as CategoryRow } from './CategoryRow.jsx';
export { default as ListingCard, spotsText, isLowSpots, shortDate, whenParts, fmtWhen, Sep } from './ListingCard.jsx';
export { default as DateTile } from './DateTile.jsx';
/** @deprecated alias of DateTile; fixed-size mode renders nothing. */
export { default as CauseTile } from './CauseTile.jsx';
export { default as NonprofitRow, Monogram, monogram } from './NonprofitRow.jsx';
export { StatusPill, StatusText, statusTone } from './StatusPill.jsx';
export { default as DateBlock, dateParts } from './DateBlock.jsx';
export { default as HoursSummary, fmtHours } from './HoursSummary.jsx';
export { default as ShareHoursCard, shareCaption, schoolYearLabel } from './ShareHoursCard.jsx';
export { MapPin, MapDot, MapPopup, MapListPopup, MapLegend, pinLabel } from './MapPins.jsx';
