'use strict';


addon.port.on('token', function(token) {
  var scope = angular.element(document.body).scope();
  if (scope !== undefined) {
    scope.$apply(function(){
      scope.token = token;
    });
  }
});


function TokenControl($scope) {
  window.console.log('TokenControl: ' + addon.options.name);
  $scope.title = addon.options.name;
  $scope.token = null;
  $scope.authenticate = function() {
    addon.port.emit('authenticate');
  };
  $scope.refresh = function() {
    addon.port.emit('refresh');
  };
}
