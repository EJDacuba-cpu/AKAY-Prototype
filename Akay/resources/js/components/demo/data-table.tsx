import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface DataTableColumn<T> {
    id: string;
    header: string;
    className?: string;
    cell: (row: T) => ReactNode;
}

interface DataTableProps<T> {
    columns: DataTableColumn<T>[];
    rows: T[];
    rowKey: (row: T) => string;
    emptyMessage?: string;
}

export default function DataTable<T>({
    columns,
    rows,
    rowKey,
    emptyMessage = 'No records found.',
}: DataTableProps<T>) {
    return (
        <div className="overflow-hidden rounded-2xl border border-[#bfdbfe] bg-white shadow-sm shadow-[#93c5fd]/15">
            <div className="overflow-x-auto">
                <table className="w-full min-w-[680px]">
                    <thead className="bg-[#eef6ff]">
                        <tr>
                            {columns.map((column) => (
                                <th
                                    key={column.id}
                                    className={cn(
                                        'px-4 py-3 text-left text-xs font-semibold tracking-[0.08em] text-[#1d4d8b] uppercase',
                                        column.className,
                                    )}
                                >
                                    {column.header}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {rows.length > 0 ? (
                            rows.map((row) => (
                                <tr
                                    key={rowKey(row)}
                                    className="border-t border-[#dbeafe] text-sm text-[#0b2d57]"
                                >
                                    {columns.map((column) => (
                                        <td
                                            key={column.id}
                                            className={cn(
                                                'px-4 py-3 align-middle',
                                                column.className,
                                            )}
                                        >
                                            {column.cell(row)}
                                        </td>
                                    ))}
                                </tr>
                            ))
                        ) : (
                            <tr>
                                <td
                                    colSpan={columns.length}
                                    className="px-4 py-8 text-center text-sm text-[#326ca6]"
                                >
                                    {emptyMessage}
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
