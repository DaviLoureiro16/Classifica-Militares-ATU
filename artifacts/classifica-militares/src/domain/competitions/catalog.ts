import { afaDefinition } from './definitions/afa';
import { epcarDefinition } from './definitions/epcar';

// Keep currently available competitions in one place. Add future selections here
// only when their source lists and competition-specific rules are supported.
export const AVAILABLE_COMPETITIONS = [epcarDefinition, afaDefinition] as const;
