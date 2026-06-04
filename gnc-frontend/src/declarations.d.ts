declare module 'vis-timeline' {
  export class Timeline {
    constructor(container: HTMLElement, items: unknown, options?: unknown);
    destroy(): void;
    setItems(items: unknown): void;
    setOptions(options: unknown): void;
    on(event: string, callback: (properties: unknown) => void): void;
    off(event: string, callback: (properties: unknown) => void): void;
  }
  export class DataSet<T = unknown> {
    constructor(data?: T[], options?: unknown);
    add(data: T | T[]): (string | number)[];
    update(data: Partial<T> | Partial<T>[]): (string | number)[];
    remove(id: string | number | (string | number)[]): (string | number)[];
    get(id?: string | number): T | T[];
    clear(): void;
  }
}
