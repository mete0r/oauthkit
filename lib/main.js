"use strict";

const tabs = require('sdk/tabs');
const Widget = require('sdk/widget').Widget;
const Panel = require('sdk/panel').Panel;
const self = require('sdk/self');
const Request = require('sdk/request').Request;
const file = require('sdk/io/file');
const timers = require('sdk/timers');
const defer = require('sdk/core/promise').defer;
const system = require('sdk/system');
const simpleprefs = require('sdk/simple-prefs');
const querystring = require('sdk/querystring');

const REQUEST_ENDPOINT = 'https://accounts.google.com/o/oauth2/auth';
const TOKEN_ENDPOINT = 'https://accounts.google.com/o/oauth2/token';

const GOOGLE_DEFAULT_SCOPE = ['https://www.googleapis.com/auth/userinfo.email'];

const oauthman_dir = file.join(system.pathFor('Home'), '.oauthman');
const oauthman_google_dir = file.join(oauthman_dir, 'google');


console.log(self.loadReason);


function console_dump_object(o) {
  for (var n in o) {
    console.log(n + ': ' + o[n]);
  }
}

function get_state_from_url(url) {
  const result = get_query_from_url(url);
  return result.state;
}

function get_result_from_callback_url(url) {
  return get_query_from_url(url);
}

function get_query_from_url(url) {
  const result = {};
  const urlpath_query = url.split('?');
  const query = urlpath_query[1];
  return decode_querystring(query);
}

function decode_querystring(query) {
  return querystring.parse(query);
}

function encode_querystring(params) {
  const items = [];
  for (var name in params) {
    const value = params[name];
    const item = encodeURIComponent(name) + '=' + encodeURIComponent(value);
    items.push(item);
  }
  return items.join('&');
}


const GoogleOAuth2 = {
  request_endpoint: REQUEST_ENDPOINT,
  token_endpoint: TOKEN_ENDPOINT,
  request_params: {
    response_type: 'code',
    client_id: undefined,
    redirect_uri: undefined,
    scope: GOOGLE_DEFAULT_SCOPE.join(' '),
    access_type: 'online',
    approval_prompt: 'auto'
  }
};


const Client = {

  __proto__: GoogleOAuth2,

  authenticate: function(object) {

    const deferred = defer();

    const $this = this;

    this.request_code(object).then(function(code) {

      $this.retrieve_token(code).then(function(auth_token) {

        console.log('authenticated');
        deferred.resolve(auth_token);

      }, function (error) {

        deferred.reject(error);

      });

    }, function(error) {

      deferred.reject(error);

    });

    return deferred.promise;
  },

  request_code: function(object) {

    const params = {
      __proto__: object,
    };

    if (object.state === undefined) {
      const state = this.generate_default_state(params);
      if (state) {
        params.state = state;
      }
    }

    const url = this.get_request_url(params);
    console.log('session request url: ' + url);

    return this.request_code_impl(url);
  },

  generate_default_state: function(params){},

  request_code_impl: undefined,

  get_request_url: function(object) {

    const params = {
      __proto__: this.request_params,
      client_id: this.client_id,
      redirect_uri: this.redirect_uri,
    };

    if (object.state !== undefined) {
      params.state = object.state;
    }
    if (object.scope !== undefined) {
      params.scope = object.scope.join(' ');
    }
    if (object.access_type !== undefined) {
      params.access_type = object.access_type;
    }
    if (object.approval_prompt !== undefined) {
      params.approval_prompt = object.approval_prompt;
    }

    return this.request_endpoint + '?' + encode_querystring(params);
  },

  retrieve_token: function(code) {
    const deferred = defer();

    const params = {
      code: code,
      client_id: this.client_id,
      client_secret: this.client_secret,
      redirect_uri: this.redirect_uri,
      grant_type: 'authorization_code'
    };

    const request = Request({
      url: this.token_endpoint,
      content: params,
      onComplete: function(response) {
        dump_http_response(response);
        if (response.status == 200) {
          deferred.resolve(response.json);
        } else {
          const error = response.status + ' ' + response.statusText;
          deferred.reject(error);
        }
      }
    });

    request.post();

    return deferred.promise;
  },

  refresh_token: function(auth_token) {
    const deferred = defer();

    const params = {
      refresh_token: auth_token.refresh_token,
      client_id: this.client_id,
      client_secret: this.client_secret,
      grant_type: 'refresh_token'
    };

    const request = Request({
      url: this.token_endpoint,
      content: params,
      onComplete: function(response) {
        dump_http_response(response);
        if (response.status == 200) {
          for (let key in response.json) {
            auth_token[key] = response.json[key];
          }
          deferred.resolve(auth_token);
        } else {
          const error = response.status + ' ' + response.statusText;
          deferred.reject(error);
        }
      }
    });

    request.post();

    return deferred.promise;
  }

};


const Agent = {

  __proto__: Client,

  request_code_impl: function(url) {

    const deferred = defer();

    console.log('request url: ' + url);

    const params = get_query_from_url(url);

    const redirect_uri = this.redirect_uri;

    tabs.open({
      url: url,

      onReady: function(tab) {
        const url = tab.url;
        if (url.substr(0, redirect_uri.length) == redirect_uri) {

          console.log('on_redirect: '+ url);

          const result = get_result_from_callback_url(url);
          console.log('result: ' + JSON.stringify(result, null, 2));

          if (result.state != params.state) {
            throw new Error(
              'state ' + result.state + ' not match with session state ' + params.state);
          }

          if (result.code !== undefined) {
            console.log('resolving ' + result.code);
            deferred.resolve(result.code);
          } else if (result.error !== undefined) {
            console.error(result.error);
            deferred.reject(new Error(result.error));
          } else {
            deferred.reject(new Error('code not found'));
          }
          tab.close();
        }
      },

      onClose: function() {
        deferred.reject(
          new Error('session' + (params.state ? ' for ' + params.state : '') + ' aborted.'));
      }
    });

    return deferred.promise;
  }

};


const dump_http_response = function(response) {
  console.log(response.status + ' ' + response.statusText);
  for (var header in response.headers) {
    console.log(header + ': ' + response.headers[header]);
  }
  console.log('');
  console.log(response.text);
};


const TokenStore = {

  save: function(auth_token) {
    const auth_token_json = JSON.stringify(auth_token, null, 2);
    const f = file.open(this.path, 'w');
    try {
      f.write(auth_token_json);
    } finally {
      f.close();
    }
  },

  load: function() {
    try {
      const f = file.open(this.path, 'r');
    } catch (e) {
      console.error(e);
      return undefined;
    }
    try {
      const s = f.read();
      return JSON.parse(s);
    } finally {
      f.close();
    }
  }

};


const Maint = {

  agent: undefined,

  token_store: undefined,

  auth_token: undefined,

  event_listeners: undefined,

  get_state: function() {
    const auth_token = this.auth_token;
    if (auth_token === undefined) {
      return 'inactive';
    } else if (auth_token.expires_at < Date.now()) {
      return 'expired';
    } else {
      return 'active';
    }
  },

  secure_token: function(auth_token) {
    const expires_in = (auth_token.expires_in - 5 * 60);
    const expires_at = Date.now() + (expires_in * 1000);
    console.log('expires_at: ' + new Date(expires_at));
    auth_token.expires_at = expires_at;
    this.token_store.save(auth_token);
    this.auth_token = auth_token;
    this.broadcast_event('token', auth_token);
    console.log('token secured.');
    timers.setTimeout(this.refresh.bind(this),
                      expires_in * 1000);
  },

  require_token: function() {
    const auth_token = this.auth_token;
    if (auth_token === undefined) {
      throw new Error('no token');
    }
    return auth_token;
  },

  queue_refresh: function() {
    const auth_token = this.require_token();
    const expires_at = auth_token.expires_at;
    const expires_in = expires_at - Date.now();
    timers.setTimeout(this.refresh.bind(this),
                      expires_in);
    console.log('token will be refreshed at ' + new Date(expires_at));
  },

  refresh: function() {
    const auth_token = this.require_token();
    this.broadcast_event('refreshing', auth_token);
    const $this = this;
    this.agent.refresh_token(auth_token).then(function(auth_token) {
      console.log('token refreshed');
      $this.secure_token(auth_token);
      $this.broadcast_event('refreshed', auth_token);
    }, function(error) {
      console.error(error);
      $this.broadcast_event('refresh-failed', error);
    });
  },

  activate: function() {
    const auth_token = this.auth_token;
    if (auth_token !== undefined) {
      return;
    }
    const params = {
      access_type: 'offline'
    };
    this.broadcast_event('authenticating');
    const $this = this;
    this.agent.authenticate(params).then(function(auth_token){
      $this.secure_token(auth_token);
      console.log('maint activated.');
      $this.broadcast_event('authenticated', auth_token);
    }, function(error) {
      console.error(error);
      $this.broadcast_event('authenticate-failed', error);
    });
  },

  broadcast_event: function(name, value) {
    const L = this.event_listeners || [];
    L.forEach(function(listener) {
      try {
        listener({name: name, value: value});
      } catch(e) {
        console.error(e);
      }
    });
  },

  on: function(name, handler) {
    this.event_listeners = this.event_listeners || [];
    const listener = function(event) {
      if (event.name == name) {
        return handler(event.value);
      }
    };
    this.event_listeners.push(listener);
  }

};


const add_client = function(name, client) {

  const agent = {
    __proto__: Agent,
    client_id: client.id,
    client_secret: client.secret,
    redirect_uri: client.redirect_uri
  };

  const token_store = {
    __proto__: TokenStore,
    path: file.join(oauthman_google_dir, name + '.json')
  };

  const maint = {
    __proto__: Maint,
    agent: agent,
    token_store: token_store,
    auth_token: token_store.load(),
    event_listeners: []
  };

  const state = maint.get_state();
  if (state == 'expired') {
    maint.refresh();
  } else if (state == 'active') {
    maint.queue_refresh();
  }

  const panel = Panel({
    contentURL: self.data.url('panel.html'),
    contentScriptOptions: {
      name: name
    },
    onShow: function() {
      panel.port.emit('token', maint.auth_token || null);
    }
  });

  maint.event_listeners.push(function(event) {
    panel.port.emit(event.name, event.value);
  });

  maint.on('authenticate-failed', function() {
    console.log('authenticate-failed.');
  });

  panel.port.on('authenticate', function() {
    maint.activate();
  });

  panel.port.on('refresh', function() {
    maint.refresh();
  });

  const widget = Widget({
    id: 'google-' + name,
    label: 'Google/' + name,
    contentURL: self.data.url('widget.html'),
    panel: panel
  });
};


exports.main = function() {

  file.mkpath(oauthman_google_dir);

  const clients = JSON.parse(self.data.load('clients.json'));
  for (let name in clients) {
    add_client(name, clients[name]);
  }
}
