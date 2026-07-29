import {spec as mediasquareSpec} from './mediasquareBidAdapter.js'; // eslint-disable-line prebid/validate-imports

const originalInterpretResponse = mediasquareSpec.interpretResponse;

export function removeMediasquareRenderer(bids) {
  return bids.map((bid) => {
    if (bid.mediaType !== 'video' || !bid.renderer) {
      return bid;
    }

    const {renderer, ...bidWithoutRenderer} = bid;
    return bidWithoutRenderer;
  });
}

mediasquareSpec.interpretResponse = function (...args) {
  return removeMediasquareRenderer(originalInterpretResponse.apply(this, args));
};
