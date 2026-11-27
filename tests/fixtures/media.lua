require "Wherigo"
Player = Wherigo.Player
ZonePoint = Wherigo.ZonePoint

cart = Wherigo.ZCartridge()
cart.Name = "Synthetic media fixture"
cart.StartingLocation = ZonePoint(0.05, 0.04, 0)

local sound = Wherigo.ZMedia(cart)
sound.Name = "Generated beep"
sound.Resources = {{Type = "wav", Filename = "beep.wav"}}

function cart:OnStart()
  Wherigo.PlayAudio(sound)
  Wherigo.MessageBox{Text = "Audio requested"}
end

return cart
