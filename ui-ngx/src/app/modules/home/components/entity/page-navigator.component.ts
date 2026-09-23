///
/// Copyright © 2016-2025 The Thingsboard Authors
///
/// Licensed under the Apache License, Version 2.0 (the "License");
/// you may not use this file except in compliance with the License.
/// You may obtain a copy of the License at
///
///     http://www.apache.org/licenses/LICENSE-2.0
///
/// Unless required by applicable law or agreed to in writing, software
/// distributed under the License is distributed on an "AS IS" BASIS,
/// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
/// See the License for the specific language governing permissions and
/// limitations under the License.
///

import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatPaginator } from '@angular/material/paginator';

/**
 * BoxTech numbered pager ("< Previous 1 2 3 … 9 Next >  Showing x–y of z").
 * It is only a view: it reads and drives an existing MatPaginator, so every
 * table keeps its own paging / sorting / URL logic unchanged.
 */
@Component({
  selector: 'tb-page-navigator',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './page-navigator.component.html',
  styleUrls: ['./page-navigator.component.scss']
})
export class PageNavigatorComponent {

  @Input() paginator: MatPaginator;

  private pagesCacheKey = '';
  private pagesCache: Array<number | null> = [];

  get pageIndex(): number {
    return this.paginator?.pageIndex ?? 0;
  }

  get pageSize(): number {
    return this.paginator?.pageSize || 1;
  }

  get length(): number {
    return this.paginator?.length || 0;
  }

  get pageCount(): number {
    return Math.max(1, Math.ceil(this.length / this.pageSize));
  }

  get pageSizeOptions(): number[] {
    return this.paginator?.pageSizeOptions ?? [];
  }

  get showPageSize(): boolean {
    return !!this.paginator && !this.paginator.hidePageSize && this.pageSizeOptions.length > 1;
  }

  get rangeStart(): number {
    return this.length ? this.pageIndex * this.pageSize + 1 : 0;
  }

  get rangeEnd(): number {
    return Math.min(this.length, (this.pageIndex + 1) * this.pageSize);
  }

  // Page indexes to render (0-based); null marks an ellipsis. Cached so change
  // detection doesn't rebuild the list on every pass.
  get pages(): Array<number | null> {
    const count = this.pageCount;
    const current = Math.min(this.pageIndex, count - 1);
    const key = `${current}/${count}`;
    if (key !== this.pagesCacheKey) {
      this.pagesCacheKey = key;
      this.pagesCache = PageNavigatorComponent.buildPages(current, count);
    }
    return this.pagesCache;
  }

  private static buildPages(current: number, count: number): Array<number | null> {
    if (count <= 7) {
      return Array.from({length: count}, (_, i) => i);
    }
    const last = count - 1;
    if (current <= 3) {
      return [0, 1, 2, 3, 4, null, last];
    }
    if (current >= last - 3) {
      return [0, null, last - 4, last - 3, last - 2, last - 1, last];
    }
    return [0, null, current - 1, current, current + 1, null, last];
  }

  goTo(index: number) {
    const paginator = this.paginator;
    if (!paginator || paginator.disabled) {
      return;
    }
    const target = Math.max(0, Math.min(index, this.pageCount - 1));
    const previousPageIndex = paginator.pageIndex;
    if (target === previousPageIndex) {
      return;
    }
    paginator.pageIndex = target;
    paginator.page.emit({
      previousPageIndex,
      pageIndex: target,
      pageSize: paginator.pageSize,
      length: paginator.length
    });
  }

  changePageSize(pageSize: number) {
    if (this.paginator && pageSize && pageSize !== this.paginator.pageSize) {
      this.paginator._changePageSize(pageSize);
    }
  }

  trackByIndex(index: number): number {
    return index;
  }
}
