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

import { AfterViewInit, Component, ElementRef, Inject, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { skip, startWith, Subject, take } from 'rxjs';
import { Store } from '@ngrx/store';
import { debounceTime, distinctUntilChanged, takeUntil } from 'rxjs/operators';

import { BreakpointObserver, BreakpointState } from '@angular/cdk/layout';
import { PageComponent } from '@shared/components/page.component';
import { AppState } from '@core/core.state';
import { getCurrentAuthState, selectAuth } from '@core/auth/auth.selectors';
import { MediaBreakpoints } from '@shared/models/constants';
import screenfull from 'screenfull';
import { MatSidenav } from '@angular/material/sidenav';
import { AuthState } from '@core/auth/auth.models';
import { WINDOW } from '@core/services/window.service';
import { instanceOfSearchableComponent, ISearchableComponent } from '@home/models/searchable-component.models';
import { ActiveComponentService } from '@core/services/active-component.service';
import { RouterTabsComponent } from '@home/components/router-tabs.component';
import { FormBuilder } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { isDefined, isDefinedAndNotNull } from '@core/utils';
import { MenuService } from '@core/services/menu.service';
import { Authority } from '@shared/models/authority.enum';
import { MenuId, MenuSection } from '@core/services/menu.models';
@Component({
  selector: 'tb-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss']
})
export class HomeComponent extends PageComponent implements AfterViewInit, OnInit, OnDestroy {

  authState: AuthState = getCurrentAuthState(this.store);
  forceFullscreen = this.authState.forceFullscreen;
  // TME customer-scoped theme detection (Trakker Middle East)
  // NOTE: recomputed reactively in ngOnInit (not just here) — HomeComponent
  // persists across "Login as customer" switches (no full page reload, no
  // component recreation), so a one-time snapshot here goes stale the moment
  // an admin uses that shortcut. See per-customer-theming-playbook.md §1.4-ish.
  isTmeCustomer = this.authState.userDetails?.customerId?.id === '57a0fa00-8d00-11f1-9902-cdf828be2d57';
  isCustomerUser = this.authState.authUser.authority === Authority.CUSTOMER_USER;



  activeComponent: any;
  searchableComponent: ISearchableComponent;

  sidenavMode: 'over' | 'push' | 'side' = 'side';
  sidenavOpened = true;
  sidebarCollapsed = false;
  isMobileSidebar = false;
  logo = 'assets/boxtech-logo.png';

  @ViewChild('sidenav')
  sidenav: MatSidenav;

  @ViewChild('searchInput') searchInputField: ElementRef;

  fullscreenEnabled = screenfull.isEnabled;

  searchEnabled = false;
  showSearch = false;
  textSearch = this.fb.control('', {nonNullable: true});

  hideLoadingBar = false;

  private destroy$ = new Subject<void>();
  availableLinks$ = this.menuService.availableMenuLinks();
  searchQuery = '';
  searchResults: MenuSection[] = [];
  searchOpen = false;

  onSearchInput(query: string): void {
    this.searchQuery = query;
    if (!query.trim()) {
      this.searchResults = [];
      this.searchOpen = false;
      return;
    }
    this.availableLinks$.pipe(take(1)).subscribe(links => {
      this.searchResults = links.filter(link =>
        link.name && link.name.toLowerCase().includes(query.toLowerCase()) && link.path
      );
      this.searchOpen = this.searchResults.length > 0;
    });
  }

  navigateToResult(path: string): void {
    this.searchQuery = '';
    this.searchResults = [];
    this.searchOpen = false;
    this.router.navigate([path]);
  }

  closeSidebarSearch(): void {
    this.searchQuery = '';
    this.searchResults = [];
    this.searchOpen = false;
  }

  entitiesLinks$ = this.menuService.menuLinksByIds([
    MenuId.devices, MenuId.assets, MenuId.entity_views, MenuId.gateways
  ]);
  profilesLinks$ = this.menuService.menuLinksByIds([
    MenuId.device_profiles, MenuId.asset_profiles
  ]);
  resourcesLinks$ = this.menuService.menuLinksByIds([
    MenuId.widget_library, MenuId.images, MenuId.scada_symbols,
    MenuId.javascript_library, MenuId.resources_library
  ]);
  

  toggleSidebarCollapsed(): void {
    if (this.isMobileSidebar) {
      return;
    }
    this.sidebarCollapsed = !this.sidebarCollapsed;
  }

  constructor(protected store: Store<AppState>,
              @Inject(WINDOW) private window: Window,
              private activeComponentService: ActiveComponentService,
              private fb: FormBuilder,
              private menuService: MenuService,
              private router: Router,
              public breakpointObserver: BreakpointObserver) {
    super(store);
  }

  ngOnInit() {
    this.store.select(selectAuth)
      .pipe(takeUntil(this.destroy$))
      .subscribe((authState: AuthState) => {
        this.authState = authState;
        this.isTmeCustomer = authState.userDetails?.customerId?.id === '57a0fa00-8d00-11f1-9902-cdf828be2d57';
        this.isCustomerUser = authState.authUser?.authority === Authority.CUSTOMER_USER;
        document.body.classList.toggle('tb-theme-tme-active', this.isTmeCustomer);
      });
    const isGtSm = this.breakpointObserver.isMatched(MediaBreakpoints['gt-sm']);
    this.sidenavMode = isGtSm ? 'side' : 'over';
    this.sidenavOpened = isGtSm;

    this.breakpointObserver
      .observe(MediaBreakpoints['gt-sm'])
      .pipe(takeUntil(this.destroy$))
      .subscribe((state: BreakpointState) => {
          if (state.matches) {
            this.sidenavMode = 'side';
            this.sidenavOpened = true;
          } else {
            this.sidenavMode = 'over';
            this.sidenavOpened = false;
            this.sidebarCollapsed = false;
          }
        }
      );

    this.breakpointObserver
      .observe('(max-width: 959px)')
      .pipe(takeUntil(this.destroy$))
      .subscribe((state: BreakpointState) => {
          this.isMobileSidebar = state.matches;
          if (state.matches) {
            this.sidebarCollapsed = false;
          }
        }
      );
  }

ngOnDestroy() {
    document.body.classList.remove('tb-theme-tme-active');
    this.destroy$.next();
    this.destroy$.complete();
  }

  ngAfterViewInit() {
    this.textSearch.valueChanges.pipe(
      debounceTime(150),
      startWith(''),
      distinctUntilChanged((a: string, b: string) => a.trim() === b.trim()),
      skip(1),
      takeUntil(this.destroy$)
    ).subscribe(value => this.searchTextUpdated(value.trim()));
  }

  sidenavClicked() {
    if (this.sidenavMode === 'over') {
      this.sidenav.toggle();
    }
  }

  toggleFullscreen() {
    if (screenfull.isEnabled) {
      screenfull.toggle();
    }
  }

  isFullscreen() {
    return screenfull.isFullscreen;
  }

  goBack() {
    this.window.history.back();
  }

  activeComponentChanged(activeComponent: any) {
    this.activeComponentService.setCurrentActiveComponent(activeComponent);
    if (!this.activeComponent) {
      setTimeout(() => {
        this.updateActiveComponent(activeComponent);
      }, 0);
    } else {
      this.updateActiveComponent(activeComponent);
    }
  }

  private updateActiveComponent(activeComponent: any) {
    this.showSearch = false;
    this.hideLoadingBar = false;
    this.textSearch.reset('', {emitEvent: false});
    this.activeComponent = activeComponent;

    if (activeComponent && activeComponent instanceof RouterTabsComponent
      && isDefinedAndNotNull(this.activeComponent.activatedRoute?.snapshot?.data?.showMainLoadingBar)) {
      this.hideLoadingBar = !this.activeComponent.activatedRoute.snapshot.data.showMainLoadingBar;
    } else if (activeComponent && activeComponent instanceof PageComponent
      && isDefinedAndNotNull(this.activeComponent?.showMainLoadingBar)) {
      this.hideLoadingBar = !this.activeComponent.showMainLoadingBar;
    }

    if (this.activeComponent && instanceOfSearchableComponent(this.activeComponent)) {
      this.searchEnabled = true;
      this.searchableComponent = this.activeComponent;
    } else {
      this.searchEnabled = false;
      this.searchableComponent = null;
    }
  }

  displaySearchMode(): boolean {
    return this.searchEnabled && this.showSearch;
  }

  openSearch() {
    if (this.searchEnabled) {
      this.showSearch = true;
      setTimeout(() => {
        this.searchInputField.nativeElement.focus();
        this.searchInputField.nativeElement.setSelectionRange(0, 0);
      }, 10);
    }
  }

  closeSearch() {
    if (this.searchEnabled) {
      this.showSearch = false;
      if (this.textSearch.value.length) {
        this.textSearch.reset();
      }
    }
  }

  private searchTextUpdated(searchText: string) {
    if (this.searchableComponent) {
      this.searchableComponent.onSearchTextUpdated(searchText);
    }
  }
}
