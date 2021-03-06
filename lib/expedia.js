const Promise = require('bluebird');
const co = require('co');
const faker = require('faker');
const geocoder = require('geocoder');
const request = require('superagent-bluebird-promise');
const striptags = require('striptags');

function geocode(lat, lon) {
  return new Promise((resolve, reject) => {
    geocoder.reverseGeocode(lat, lon, (err, data) => {
      if (err) return reject(err);
      return resolve(data);
    });
  });
}

const API_KEY = process.env.EXPEDIA_API_KEY;
const BASE_URL = 'http://terminal2.expedia.com/x/';

function nlpSearch(query) {
  return request.
    get(`${BASE_URL}nlp/results`).
    query({
      q: query,
      apikey: API_KEY
    }).
    promise();
}

function activities(location) {
  return request.
    get(`${BASE_URL}activities/search`).
    query({
      location: location,
      apikey: API_KEY
    }).
    promise();
}

function activityDetails(activityId) {
  return request.
    get(`${BASE_URL}activities/details`).
    query({
      activityId: activityId,
      apikey: API_KEY
    }).
    promise();
}

function hotels(location, radius) {
  radius = radius || '50km';
  return request.
    get(`${BASE_URL}hotels`).
    query({
      location: location,
      radius: radius,
      apikey: API_KEY
    }).
    promise();
}

function flightsOverview(origin, dest) {
  const body = {
    MessageHeader: {
      ClientInfo: {
        DirectClientName: "Hackathon"
      },
      TransactionGUID: ""
    },
    tpid: 1,
    eapid: 0,
    PointOfSaleKey: {
      JurisdictionCountryCode: "USA",
      CompanyCode: "10111",
      ManagementUnitCode: "1010"
    },
    OriginAirportCodeList: {
      AirportCode: origin
    },
    DestinationAirportCodeList: {
      AirportCode: dest
    },
    FareCalendar: {}
  };
  return request.
    post(`${BASE_URL}flights/overview/get`).
    send(body).
    set({
      Authorization: `expedia-apikey key=${API_KEY}`
    }).
    promise();
}

const cityInfo = co.wrap(function* cityInfo(location) {
  const activitiesResp = yield activities(location);
  const acts = activitiesResp.body.activities.slice(0, 70);
  const loc = acts[0].latLng;

  const hotelsResp = yield hotels(loc);
  const hot = hotelsResp.body.HotelInfoList.HotelInfo;

  const myHot = hot[1];
  myHot.link = `expda://hotelSearch?hotelId=${myHot.HotelID}`;
  myHot.price = (200 + Math.random() * 35).toFixed(2);

  const actsDetailed = yield Promise.map(acts, co.wrap(function* (act) {
    const details = yield activityDetails(act.id);
    const desc = striptags(details.body.description);

    const img = details.body.images[0].url;

    const ll = act.latLng.split(',').map(x => parseFloat(x));
    const geocoded = yield geocode(ll[0], ll[1]);

    return {
      id: act.id,
      img: img,
      name: act.title,
      distanceFromHotel: 0.7,
      latLng: act.latLng,
      address: geocoded.results[0].formatted_address,
      price: act.fromPrice,
      match: Math.floor(Math.random() * 20) + 80,
      rating: act.recommendationScore / 20,
      ratingName: `${faker.name.firstName()} ${faker.name.lastName()}`,
      ratingDescription: `I love ${act.title}. It is an amazing place!`,
      description: act.description,
      descriptionLong: desc,
      bookWebsite: `http://www.expedia.com/activities/${act.id}`
    };
  }), {
    concurrency: 1
  });

  const flightsResponse = yield flightsOverview(['OAK', 'SFO'], ['LGA', 'EWR', 'JFK']);
  const flights = flightsResponse.body.FareCalendar.AirOfferSummary;
  const flight = flights[0];
  flight.airline = 'Spirit Airlines';

  return {
    hotel: myHot,
    flight: flight,
    activities: actsDetailed
  };
});

module.exports = {
  nlpSearch: nlpSearch,
  activities: activities,
  hotels: hotels,
  cityInfo: cityInfo
};
