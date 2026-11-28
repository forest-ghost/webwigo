(function() {
  var assetVersion = document.querySelector('meta[name="webwigo-assets"]').content
  window.webwigoAsset = function(path) {
    return assetVersion ? path + "?v=" + assetVersion : path
  }
  window.webwigoAssetVersion = assetVersion

  var status = document.getElementById("id-player-status")
  var retry = document.getElementById("id-player-retry")
  var load = document.getElementById("id-tab-btn-load")
  load.disabled = true
  var timeout = setTimeout(window.webwigoStartupFailed = function() {
    clearTimeout(timeout)
    load.disabled = true
    status.hidden = false
    status.firstElementChild.textContent = "WebWigo could not start. Check your connection and reload."
    retry.hidden = false
  }, 15000)
  retry.addEventListener("click", function() { window.location.reload() })
  window.webwigoStartupReady = function() {
    clearTimeout(timeout)
    status.hidden = true
    load.disabled = false
  }
})()
