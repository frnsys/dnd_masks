# Set up a virtual webcam to use in Zoom, etc

1. <https://github.com/umlaeute/v4l2loopback/>
    1. Clone
    2. `make && sudo make install`
    3. `sudo depmod -a`
2. `sudo modprobe v4l2loopback`
3. Check what video device it is (usually the last of `/dev/videoX`)
4. Example: `ffmpeg -f x11grab -r 15 -s 1280x720 -i :0.0+0,0 -vcodec rawvideo -pix_fmt yuv420p -threads 0 -f v4l2 -vf hflip,scale=1280x720 /dev/video2`
    - Can adjust the offset with `-i :0.0+x,y`
    - The frame rate is the `-r 15` parameter
    - Scale has to be 1280x720. Your input scale (`-s`) can be lower, so long as the scale filter is added (as it is in the example command)
    - You can stream a specific part of your screen by using `slop` like so: `ffmpeg -f x11grab -r 15 $(slop -f '-video_size %wx%h -i +%x,%y') -vcodec rawvideo -pix_fmt yuv420p -threads 0 -f v4l2 -vf hflip,scale=1280x720 /dev/video2`

## References

- <https://superuser.com/questions/411897/using-desktop-as-fake-webcam-on-linux>

## Gifs

![](https://d2w9rnfcy7mm78.cloudfront.net/11021887/original_93a1ead25b577c3e69ee36081d09864d.gif?1614825337?bc=0)

![](https://d2w9rnfcy7mm78.cloudfront.net/11023624/original_2ef5f3ed2d5e26a8d289f16379a131a1.gif?1614834857?bc=0)