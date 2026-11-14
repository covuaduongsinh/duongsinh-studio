import type { Application } from '@nocobase/app-server/application';
import { databaseManagerToken } from '@nocobase/db';
import {
  ServiceProvider,
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';
import {
  createReviewsService,
  type ReviewsService,
} from '../reviews/service.js';
import { onReviewedReaction } from './reactions.js';
import { gitServiceToken } from './git.js';

export const reviewsServiceToken: ServiceToken<ReviewsService> =
  createServiceToken<ReviewsService>('app/reviews');

export default class ReviewsProvider extends ServiceProvider<Application> {
  readonly name = 'app/reviews';

  override register(): void {
    const { container } = this.app;
    container.singleton(reviewsServiceToken, () =>
      createReviewsService({
        database: container.resolve(databaseManagerToken),
        git: () => container.resolve(gitServiceToken),
        onReviewed: (input) => onReviewedReaction(container, input),
      }),
    );
  }
}
