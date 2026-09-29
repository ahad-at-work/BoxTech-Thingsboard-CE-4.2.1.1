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

import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { MenuService } from '@core/services/menu.service';
import { MenuId, MenuSection } from '@core/services/menu.models';
import { BreakpointObserver } from '@angular/cdk/layout';
import { map } from 'rxjs/operators';
import { MediaBreakpoints } from '@shared/models/constants';

const HEADER_DUPLICATED_IDS: string[] = [
  MenuId.dashboards, MenuId.entities, MenuId.profiles, MenuId.customers, MenuId.resources
];

// Shared customer navigation order, originally defined for Trakker Middle East.
// Dashboards is included directly here (no separate Quick Access group).
const CUSTOMER_MAIN_ORDER: string[] = [
  MenuId.home, MenuId.entities, MenuId.alarms, MenuId.dashboards,
  MenuId.edge_instances, MenuId.notifications_center
];

@Component({
  selector: 'tb-side-menu',
  templateUrl: './side-menu.component.html',
  styleUrls: ['./side-menu.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SideMenuComponent {
  @Input() collapsed = false;
  @Input() customerLayout = false;

  headerDuplicatedIds = HEADER_DUPLICATED_IDS;
  isDesktop$ = this.breakpointObserver.observe(MediaBreakpoints['gt-sm']).pipe(
    map(state => state.matches)
  );
  menuSections$ = this.menuService.menuSections();

  constructor(private menuService: MenuService,
              private breakpointObserver: BreakpointObserver) {
  }

  trackByMenuSection(index: number, section: MenuSection){
    return section.id;
  }

  hasExpandedSection(sections: MenuSection[] | null, desktop = false): boolean {
    return !!sections?.some(s =>
      s.type !== 'link' && s.opened && !(desktop && !this.customerLayout && this.headerDuplicatedIds.includes(s.id))
    );
  }

  // Re-orders permitted sections for customers using the sidebar-only navigation layout.
  // The default shell continues to use ctx.sections directly.
  customerOrderedSections(sections: MenuSection[] | null): MenuSection[] {
    if (!sections) {
      return [];
    }
    return CUSTOMER_MAIN_ORDER
      .map(id => sections.find(s => s.id === id))
      .filter((s): s is MenuSection => !!s);
  }

  onToggled(): void {
  }
}
