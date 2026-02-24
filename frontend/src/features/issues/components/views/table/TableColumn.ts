export interface TableColumnDef {
  key: string;
  label: string;
  defaultWidth: number;
  minWidth: number;
  sortable: boolean;
  resizable: boolean;
}

export const DEFAULT_COLUMNS: TableColumnDef[] = [
  {
    key: 'identifier',
    label: 'ID',
    defaultWidth: 100,
    minWidth: 80,
    sortable: true,
    resizable: false,
  },
  {
    key: 'name',
    label: 'Title',
    defaultWidth: 400,
    minWidth: 200,
    sortable: true,
    resizable: true,
  },
  {
    key: 'state',
    label: 'State',
    defaultWidth: 130,
    minWidth: 100,
    sortable: true,
    resizable: true,
  },
  {
    key: 'priority',
    label: 'Priority',
    defaultWidth: 110,
    minWidth: 80,
    sortable: true,
    resizable: true,
  },
  { key: 'type', label: 'Type', defaultWidth: 110, minWidth: 80, sortable: true, resizable: true },
  {
    key: 'assignee',
    label: 'Assignee',
    defaultWidth: 150,
    minWidth: 100,
    sortable: true,
    resizable: true,
  },
  {
    key: 'labels',
    label: 'Labels',
    defaultWidth: 200,
    minWidth: 100,
    sortable: false,
    resizable: true,
  },
  {
    key: 'estimate',
    label: 'Estimate',
    defaultWidth: 90,
    minWidth: 60,
    sortable: true,
    resizable: true,
  },
  {
    key: 'dueDate',
    label: 'Due Date',
    defaultWidth: 120,
    minWidth: 80,
    sortable: true,
    resizable: true,
  },
  {
    key: 'createdAt',
    label: 'Created',
    defaultWidth: 120,
    minWidth: 80,
    sortable: true,
    resizable: false,
  },
  {
    key: 'updatedAt',
    label: 'Updated',
    defaultWidth: 120,
    minWidth: 80,
    sortable: true,
    resizable: false,
  },
];

export const DEFAULT_VISIBLE = ['identifier', 'name', 'state', 'priority', 'assignee', 'labels'];

export type SortDirection = 'asc' | 'desc' | null;
