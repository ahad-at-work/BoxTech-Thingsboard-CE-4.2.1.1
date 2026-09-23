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

import { ChangeDetectionStrategy, Component, ElementRef, EventEmitter, Input, OnInit, Output, ViewChild } from '@angular/core';
import { MenuSection } from '@core/services/menu.models';
import { Router } from '@angular/router';
import { Store } from '@ngrx/store';
import { AppState } from '@core/core.state';
import { ActionPreferencesUpdateOpenedMenuSection } from '@core/auth/auth.actions';
@Component({
  selector: 'tb-menu-toggle',
  templateUrl: './menu-toggle.component.html',
  styleUrls: ['./menu-toggle.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MenuToggleComponent implements OnInit {
  @Input() section: MenuSection;
  @Input() collapsed = false;
  @Output() toggled = new EventEmitter<void>();
  @ViewChild('flyoutTrigger') flyoutTrigger: ElementRef;
  flyoutOpen = false;
  flyoutStyle: { position: string; left: string; top: string } = { position: 'fixed', left: '0px', top: '0px' };
  constructor(private router: Router,
              private store: Store<AppState>,
              private elementRef: ElementRef) {
  }
  ngOnInit() {
  }
  sectionHeight(): string {
    if (this.section.opened) {
      const rowHeight = this.getRowHeight();
      return this.section.pages.length * rowHeight + 'px';
    } else {
      return '0px';
    }
  }
  // Cached: sectionHeight() runs on every change detection pass and
  // getComputedStyle() forces a synchronous style recalculation.
  private rowHeight: number = null;
  private getRowHeight(): number {
    if (this.rowHeight === null) {
      const raw = getComputedStyle(this.elementRef.nativeElement).getPropertyValue('--tb-row-height').trim();
      const parsed = parseInt(raw, 10);
      if (isNaN(parsed)) {
        // Not attached / styled yet — don't cache the fallback.
        return 30;
      }
      this.rowHeight = parsed;
    }
    return this.rowHeight;
  }
  toggleSection(event: MouseEvent) {
    event.stopPropagation();
    if (this.collapsed) {
      this.flyoutOpen = !this.flyoutOpen;
    } else {
      this.rowHeight = null;
      this.section.opened = !this.section.opened;
      this.store.dispatch(new ActionPreferencesUpdateOpenedMenuSection({path: this.section.path, opened: this.section.opened}));
      this.toggled.emit();
    }
  }
  openFlyout(): void {
    if (this.collapsed) {
      if (this.flyoutTrigger) {
        const rect = this.flyoutTrigger.nativeElement.getBoundingClientRect();
        this.flyoutStyle = {
          position: 'fixed',
          left: rect.right + 'px',
          top: rect.top + 'px'
        };
      }
      this.flyoutOpen = true;
    }
  }
  closeFlyout(): void {
    if (this.collapsed) {
      this.flyoutOpen = false;
    }
  }
  trackBySectionPages(index: number, section: MenuSection){
    return section.id;
  }
}
