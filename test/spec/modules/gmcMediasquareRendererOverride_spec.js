import {expect} from 'chai';
import {removeMediasquareRenderer} from 'modules/gmcMediasquareRendererOverride.js';
import {spec as mediasquareSpec} from 'modules/mediasquareBidAdapter.js';
import adapterManager from 'src/adapterManager.js';

const VIDEO_RESPONSE = {
  body: {
    responses: [{
      bid_id: 'video-bid',
      cpm: 1,
      width: 640,
      height: 360,
      creative_id: 'creative',
      currency: 'EUR',
      net_revenue: true,
      ttl: 60,
      adomain: ['example.com'],
      video: {
        xml: '<VAST/>',
        url: 'https://example.com/vast.xml'
      }
    }]
  }
};

describe('gmcMediasquareRendererOverride', function () {
  it('removes the adapter renderer from video bids', function () {
    const renderer = {url: 'https://example.com/renderer.js'};
    const bids = [{
      requestId: 'video-bid',
      mediaType: 'video',
      renderer,
      vastXml: '<VAST/>'
    }];

    expect(removeMediasquareRenderer(bids)).to.deep.equal([{
      requestId: 'video-bid',
      mediaType: 'video',
      vastXml: '<VAST/>'
    }]);
    expect(bids[0].renderer).to.equal(renderer);
  });

  it('does not change banner or native bids', function () {
    const bids = [
      {requestId: 'banner-bid', mediaType: 'banner', renderer: {url: 'banner'}},
      {requestId: 'native-bid', mediaType: 'native'}
    ];

    const result = removeMediasquareRenderer(bids);

    expect(result[0]).to.equal(bids[0]);
    expect(result[1]).to.equal(bids[1]);
  });

  it('patches the registered MediaSquare spec used by GMC aliases', function () {
    const directBid = mediasquareSpec.interpretResponse(VIDEO_RESPONSE)[0];
    expect(directBid).not.to.have.property('renderer');

    adapterManager.aliasBidAdapter('mediasquare', 'GMC-Mediasquare', {
      useBaseGvlid: true
    });
    const aliasSpec = adapterManager.bidderRegistry['GMC-Mediasquare'].getSpec();
    const aliasBid = aliasSpec.interpretResponse(VIDEO_RESPONSE)[0];

    expect(aliasBid).not.to.have.property('renderer');
  });
});
