import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { of } from 'rxjs';

import { History } from './history';
import { AnalysisRepository } from '../../core/analysis.repository';

const mockAnalysisRepository = {
  getAllRecommendations: () => of([]),
};

describe('History', () => {
  let component: History;
  let fixture: ComponentFixture<History>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [History],
      providers: [
        provideTranslateService({ lang: 'en' }),
        { provide: AnalysisRepository, useValue: mockAnalysisRepository },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(History);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
